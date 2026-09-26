export type ValuationModelId =
  | "dcf"
  | "growth-exit"
  | "trading-multiples"
  | "forward-multiple"
  | "sotp";

export interface ValuationModelInfo {
  id: ValuationModelId;
  nameHe: string;
  shortNameHe: string;
  icon: "TrendingUp" | "Rocket" | "BarChart3" | "Target" | "Layers";
  whatItIsHe: string;
  whatYouDoHe: string[];
  bestForHe: string;
}

// The five valuation approaches offered in the guided flow. Order here is
// the order the model-selection screen renders them in.
export const VALUATION_MODELS: ValuationModelInfo[] = [
  {
    id: "dcf",
    nameHe: "היוון תזרים מזומנים (DCF)",
    shortNameHe: "DCF",
    icon: "TrendingUp",
    whatItIsHe:
      "מעריך שווי לפי היוון תזרימי המזומנים החופשיים העתידיים של החברה, פלוס ערך טרמינלי, לערכם הנוכחי לפי שיעור היוון (WACC).",
    whatYouDoHe: [
      "לקבוע תזרים מזומנים חופשי בסיסי ושיעור צמיחה שנתי לתקופת התחזית",
      "לבחור שיעור היוון (WACC) ושיעור צמיחה טרמינלי לטווח הארוך",
      "להזין חוב נטו ומספר מניות כדי לגזור שווי למניה",
    ],
    bestForHe:
      "חברות בוגרות ויציבות עם תזרים מזומנים חזוי וניתן להערכה — לדוגמה חברות תוכנה, תעשייה או תשתיות. פחות מתאים לחברות עם תזרים שלילי או לא יציב.",
  },
  {
    id: "growth-exit",
    nameHe: "מודל צמיחה ומכפיל יציאה (Bear / Base / Bull)",
    shortNameHe: "צמיחה ומכפיל יציאה",
    icon: "Rocket",
    whatItIsHe:
      "מקרין הכנסות קדימה לפי קצב צמיחה קבוע, מחשב רווח נקי לפי מרווח רווח, ומפעיל מכפיל רווח עתידי (P/E) ביציאה בשלושה תרחישים — שמרני, בסיס ואופטימי — כדי לגזור מחיר יעד עתידי, תשואה שנתית גלומה (CAGR) ושווי הוגן היום.",
    whatYouDoHe: [
      "לקבוע שיעור צמיחת הכנסות שנתי ומרווח רווח נקי צפוי",
      "לבחור אופק זמן (מספר שנים) ושיעור תשואה נדרש (WACC)",
      "להזין שלושה מכפילי יציאה — שמרני, בסיס ואופטימי — ולראות טווח תוצאות",
    ],
    bestForHe:
      "חברות צמיחה שבהן קשה לחזות תזרים מזומנים יציב לטווח ארוך, אבל אפשר להעריך את קצב הצמיחה ואת המכפיל שהשוק עשוי לשלם בעתיד — טכנולוגיה, צמיחה גבוהה, חברות טרום-רווחיות.",
  },
  {
    id: "trading-multiples",
    nameHe: "מכפילי מסחר (EV/EBITDA · P/E · P/S)",
    shortNameHe: "מכפילי מסחר",
    icon: "BarChart3",
    whatItIsHe:
      "משווה את מכפילי הסחר של החברה (EV/EBITDA, P/E או P/S, לפי המדד הרלוונטי לסקטור) מול הממוצע הענפי, ומיישם מכפיל יעד על המדד של החברה כדי לגזור שווי גלום.",
    whatYouDoHe: [
      "לבחור את המדד המתאים לסקטור (EBITDA לרוב הסקטורים, רווח נקי לבנקים ופיננסים)",
      "לבחור מכפיל יעד — לרוב סביב הממוצע הענפי, מעליו או מתחתיו לפי איכות העסק",
      "להזין חוב נטו ומספר מניות כדי לגזור שווי למניה",
    ],
    bestForHe:
      "השוואה מהירה מול מתחרים בענפים בוגרים ומחזוריים — מוליכים למחצה, בנקאות, תרופות גנריות. פחות רלוונטי לחברות ללא רווחיות עדיין.",
  },
  {
    id: "forward-multiple",
    nameHe: "מכפיל עתידי (Forward Multiple)",
    shortNameHe: "מכפיל עתידי",
    icon: "Target",
    whatItIsHe:
      "מיישם מכפיל רווח/הכנסה על אומדן עתידי (בדרך כלל שנה קדימה), במקום על נתוני העבר — משקף איך משקיעים בפועל מתמחרים חברות צמיחה.",
    whatYouDoHe: [
      "לבחור את אומדן הרווח או ההכנסה למניה לשנה הקרובה (מקונצנזוס האנליסטים או הנחיית החברה)",
      "לבחור מכפיל עתידי סביר לפי הסקטור וקצב הצמיחה",
      "לחשב מחיר יעד גלום ולהשוות למחיר הנוכחי",
    ],
    bestForHe:
      "חברות צמיחה שעדיין בתחילת דרכן לרווחיות מלאה, שבהן מכפילי עבר פחות משמעותיים — טכנולוגיה, מוליכים למחצה בשלב הרחבה.",
  },
  {
    id: "sotp",
    nameHe: "סכום החלקים (SOTP)",
    shortNameHe: "SOTP",
    icon: "Layers",
    whatItIsHe:
      "מפרק את החברה למגזרי פעילות נפרדים, מעריך כל מגזר בנפרד לפי המדד והמכפיל המתאימים לו, ומחבר לשווי פעילות כולל.",
    whatYouDoHe: [
      "לפרק את החברה למגזרי הפעילות העיקריים שלה",
      "לקבוע מדד שווי (הכנסה/EBITDA) ומכפיל מתאים לכל מגזר בנפרד",
      "להזין חוב נטו ומספר מניות כדי לגזור שווי כולל למניה",
    ],
    bestForHe:
      "חברות מגוונות עם כמה קווי עסקים שונים מהותית זה מזה (ענן לצד קמעונאות, חומרה לצד שירותים) או אחזקות/קונגלומרטים — כשההערכה כמכלול אחד מטשטשת את השווי האמיתי של כל חלק.",
  },
];

export function getValuationModel(id: ValuationModelId): ValuationModelInfo | undefined {
  return VALUATION_MODELS.find((m) => m.id === id);
}

export interface ModelFitNote {
  recommended: boolean;
  reasonHe: string;
}

// A light, sector/growth-aware heuristic for which models fit a given
// company best — used to badge the model-selection cards once a company
// is already chosen, and to explain *why* on the company/model summary.
// This is intentionally simple (high-level, not a precise classifier):
// it looks at the company's forward growth rate and whether it has more
// than one reported business segment.
//
// Phase 3, third track: takes already-resolved inputs instead of looking
// the ticker up itself — growthPct/isBank/hasMultipleSegments now come
// from live FMP data (via useLiveCompanyFundamentals) when available, so
// this pure function no longer needs to know whether its caller's data
// came from FMP or from the mock demo directory.
export function getModelFitNotes(
  growthPct: number,
  isBank: boolean,
  hasMultipleSegments: boolean
): Record<ValuationModelId, ModelFitNote> {
  const isHighGrowth = growthPct >= 15;

  return {
    dcf: isBank
      ? { recommended: false, reasonHe: "עבור בנקים תזרים המזומנים החופשי פחות משקף — מכפילי רווח/הון בדרך כלל מדויקים יותר." }
      : isHighGrowth
        ? { recommended: false, reasonHe: "קצב צמיחה גבוה מקשה להעריך תזרים יציב לטווח ארוך — מודל הצמיחה/מכפיל היציאה בדרך כלל מתאים יותר." }
        : { recommended: true, reasonHe: `קצב צמיחה מתון (כ-${growthPct.toFixed(0)}%) ותזרים ניתן לחיזוי — מתאים היטב ל-DCF.` },
    "growth-exit": isHighGrowth
      ? { recommended: true, reasonHe: `קצב צמיחה גבוה (כ-${growthPct.toFixed(0)}%) — מודל מבוסס מכפיל יציאה עתידי מתאים יותר מתזרים מזומנים קלאסי.` }
      : { recommended: false, reasonHe: "החברה כבר בוגרת יחסית עם צמיחה מתונה — מודל DCF קלאסי בדרך כלל מדויק יותר עבורה." },
    "trading-multiples": isBank
      ? { recommended: true, reasonHe: "עבור בנקים משווים בעיקר לפי מכפיל רווח (P/E) ותשואה להון (ROE) מול הענף." }
      : { recommended: true, reasonHe: "תמיד שימושי כבדיקת היגיון מהירה מול חברות דומות בענף." },
    "forward-multiple": isHighGrowth
      ? { recommended: true, reasonHe: "כשהרווחיות עדיין בבנייה, השוק מתמחר לפי אומדני העתיד ולא לפי נתוני עבר." }
      : { recommended: false, reasonHe: "לחברה בוגרת עם רווחיות יציבה, מכפיל על נתוני עבר בדרך כלל מספיק." },
    sotp: hasMultipleSegments
      ? { recommended: true, reasonHe: "לחברה כמה קווי עסקים שונים מהותית — פירוק לחלקים חושף שווי שמוערך כמכלול אחד." }
      : { recommended: false, reasonHe: "בדמו הזה לא מדווח פירוט מגזרים עבור החברה — SOTP עדיין אפשרי, אך פחות משמעותי בלי פירוק אמיתי." },
  };
}
