// Israeli stocks and indices (Tel Aviv Stock Exchange), searchable and
// pickable from the Portfolio Builder's add-position window — separate
// from mockStockDetails/mockPriceByTicker (which are USD-oriented)
// because these prices are quoted in shekels (₪), matching how the
// currency toggle treats them. Every ticker ends in ".TA" so the app's
// Israeli-security detection (isIsraeliTicker) picks them up. Phase 3
// replaces this with a live TASE feed.
export interface IsraeliSecurity {
  ticker: string;
  nameHe: string;
  sectorNameHe: string;
  price: number; // ILS
  kind: "stock" | "index";
}

export const mockIsraeliSecurities: IsraeliSecurity[] = [
  { ticker: "TEVA.TA", nameHe: "טבע", sectorNameHe: "בריאות ותרופות", price: 189.4, kind: "stock" },
  { ticker: "POLI.TA", nameHe: "בנק הפועלים", sectorNameHe: "בנקאות", price: 152.3, kind: "stock" },
  { ticker: "LUMI.TA", nameHe: "בנק לאומי", sectorNameHe: "בנקאות", price: 143.7, kind: "stock" },
  { ticker: "DSCT.TA", nameHe: "בנק דיסקונט", sectorNameHe: "בנקאות", price: 24.1, kind: "stock" },
  { ticker: "HAPO.TA", nameHe: "הפניקס אחזקות", sectorNameHe: "ביטוח ופיננסים", price: 412.6, kind: "stock" },
  { ticker: "ESLT.TA", nameHe: "אלביט מערכות", sectorNameHe: "ביטחון ותעופה", price: 3120.5, kind: "stock" },
  { ticker: "ICL.TA", nameHe: "כיל", sectorNameHe: "כימיקלים", price: 24.8, kind: "stock" },
  { ticker: "NICE.TA", nameHe: "נייס", sectorNameHe: "תוכנה", price: 685.0, kind: "stock" },
  { ticker: "CHKP.TA", nameHe: "צ׳ק פוינט", sectorNameHe: "אבטחת מידע", price: 594.2, kind: "stock" },
  { ticker: "TA35.TA", nameHe: 'מדד ת"א 35', sectorNameHe: "מדד מניות", price: 2680.0, kind: "index" },
  { ticker: "TA125.TA", nameHe: 'מדד ת"א 125', sectorNameHe: "מדד מניות", price: 2340.0, kind: "index" },
  { ticker: "TA90.TA", nameHe: 'מדד ת"א 90', sectorNameHe: "מדד מניות", price: 1870.0, kind: "index" },
  { ticker: "TABANK.TA", nameHe: "מדד הבנקים", sectorNameHe: "מדד סקטוריאלי", price: 3410.0, kind: "index" },
];
