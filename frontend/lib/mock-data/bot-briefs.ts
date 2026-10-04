// Static configuration for the AI bot's briefs (daily/weekly, across
// markets). The brief content itself is real and fetched live — see
// components/dashboard/tools/bot/MarketBrief.tsx and backend
// app/services/briefs.py. What stays here is fixed reference data only.

// The analyst voice the US-market daily brief follows, per an explicit
// request to include this account. These are real, public facts about
// his coverage; what he's been writing about lately is searched live by
// the brief (`top_voice_theme_he`) and the section is hidden when nothing
// reliable is found.
export interface TopVoice {
  handle: string;
  nameHe: string;
  focusHe: string;
}

export const DAILY_US_TOP_VOICE: TopVoice = {
  handle: "@StockSavvyShay",
  nameHe: "שיי בולור",
  focusHe: "אנליסט טכנולוגיה ושבבים עצמאי בטוויטר/X, מתמקד בשרשרת הערך של תשתיות ה-AI — עיצוב שבבים, זיכרון HBM, אריזה מתקדמת וקיבולת ייצור.",
};

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
