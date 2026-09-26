import { DashboardSection } from "@/lib/types";

// Configuration for every clickable button on the dashboard, grouped into
// the three core modules from the product spec. Hebrew labels are exactly
// as specified by the user; icon names map to lucide-react components.
export const dashboardSections: DashboardSection[] = [
  {
    id: "portfolio-risk",
    titleHe: "ניהול תיק וסיכונים",
    subtitleHe: "מעקב אחזקות, גודל פוזיציה והערכות שווי מותאמות אישית",
    buttonSize: "large",
    buttons: [
      {
        id: "risk-management",
        labelHe: "ניהול סיכונים",
        descriptionHe: "מחשבון גודל פוזיציה, יחסי סיכון/סיכוי וניהול סטופ-לוס",
        icon: "ShieldAlert",
      },
      {
        id: "portfolio-builder",
        labelHe: "הרכבת תיק השקעות",
        descriptionHe: "בניית ומעקב אחר הקצאת נכסים וחשיפה כוללת",
        icon: "PieChart",
      },
      {
        id: "custom-valuation",
        labelHe: "הערכת שווי מותאמת",
        descriptionHe: "DCF, EV/EBITDA, מכפילים עתידיים, תשואת FCF ו-SOTP",
        icon: "Calculator",
      },
    ],
  },
  {
    id: "analyst-bot",
    titleHe: "הבוט האנליסט האוטומטי",
    subtitleHe: "בוט AI עם כמה תפקידים — בריפים, ניתוח מגמות, סורק מניות ועוד",
    buttonSize: "large",
    buttons: [
      {
        id: "ai-bot",
        labelHe: "בוט AI",
        descriptionHe: "בריפים יומיים ושבועיים, ניתוח מגמות ומגמות כלכלה, סורק מניות (טרנדיות/מומנטום+באז/כסף חכם), ניתוח דוחות אוטומטי והתראות מותאמות אישית",
        icon: "Bot",
      },
    ],
  },
  {
    id: "deep-research",
    titleHe: "מחקר מעמיק וסיכומים",
    subtitleHe: "ניתוח דוחות, בניית תזות השקעה וסיכומים שבועיים",
    buttonSize: "large",
    buttons: [
      {
        id: "financial-report-analysis",
        labelHe: "ניתוח דוחות כספיים",
        descriptionHe: "העלאת 10-K / 10-Q או תמלול שיחת רווחים לחילוץ מדדים מרכזיים",
        icon: "FileSearch",
      },
      {
        id: "thesis-builder",
        labelHe: "בניית תזה",
        descriptionHe: "טופס מובנה ליצירת תזת השקעה מקצועית ומעמיקה",
        icon: "NotebookPen",
      },
      {
        id: "weekly-summary",
        labelHe: "סיכום שבועי",
        descriptionHe: "סקירת תשואות מדדים, קריפטו ואג\"ח וסיכום מאקרו שבועי",
        icon: "CalendarDays",
      },
    ],
  },
];
