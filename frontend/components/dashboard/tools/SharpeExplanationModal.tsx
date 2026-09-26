"use client";

import { X } from "lucide-react";
import { RISK_FREE_RATE_PCT } from "@/lib/mock-data/portfolio-risk";

export interface SharpeRiskContribution {
  ticker: string;
  nameHe: string;
  weightPct: number;
  volatilityPct: number;
  contributionPct: number;
  avgCorrelationWithRest: number;
  topCorrelatedTicker: string | null;
  topCorrelation: number;
}

interface QualityInfo {
  labelHe: string;
  className: string;
}

interface SharpeExplanationModalProps {
  onClose: () => void;
  annualReturnPct: number;
  portfolioVolPct: number;
  sharpeRatio: number;
  quality: QualityInfo;
  contributions: SharpeRiskContribution[];
}

function formatCorrelation(value: number): string {
  return value.toFixed(2);
}

// Full breakdown behind the Sharpe ratio headline number: what it is,
// exactly how it was computed for this portfolio (with the real numbers
// plugged into the formula), which holdings actually drive the
// portfolio's risk once correlation is accounted for (not just the
// biggest position), and plain-language conclusions about what's worth
// trimming vs. keeping from a risk-management standpoint.
export function SharpeExplanationModal({
  onClose,
  annualReturnPct,
  portfolioVolPct,
  sharpeRatio,
  quality,
  contributions,
}: SharpeExplanationModalProps) {
  const biggestContributor = contributions[0];
  const smallestContributor = contributions[contributions.length - 1];
  // A holding is a "disproportionate" risk driver when its share of total
  // portfolio risk clearly exceeds its share of capital — i.e. its own
  // volatility and correlation with the rest of the book are doing more
  // damage than its position size alone would suggest.
  const disproportionateContributors = contributions.filter(
    (c) => c.contributionPct > c.weightPct * 1.15 && c.contributionPct >= 15
  );
  const excessReturnPct = annualReturnPct - RISK_FREE_RATE_PCT;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-900">יחס שארפ — הסבר מלא</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-700"
            aria-label="סגור"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          <section>
            <p className="mb-1.5 text-sm font-bold text-slate-800">מה זה יחס שארפ?</p>
            <p className="text-sm leading-relaxed text-slate-500">
              יחס שארפ מודד כמה תשואה עודפת (מעבר לריבית חסרת סיכון) מקבלים
              על כל יחידת סיכון (תנודתיות) שלוקחים. שני תיקים יכולים להניב
              אותה תשואה, אבל אם אחד מהם עושה זאת עם תנודתיות נמוכה יותר —
              יחס השארפ שלו יהיה גבוה יותר, והוא נחשב "יעיל" יותר מבחינת
              ניהול סיכונים. ככלל אצבע: מתחת ל-0.5 נחשב חלש, סביב 1 טוב,
              ומעל 1.5 מצוין.
            </p>
          </section>

          <section>
            <p className="mb-1.5 text-sm font-bold text-slate-800">איך חושב עבור התיק שלכם</p>
            <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
              <p className="text-xs leading-relaxed text-slate-500">
                (תשואה שנתית − ריבית חסרת סיכון) ÷ תנודתיות התיק
              </p>
              <p className="mt-1.5 font-mono text-sm text-slate-800">
                ({annualReturnPct.toFixed(1)}% − {RISK_FREE_RATE_PCT}%) ÷ {portfolioVolPct.toFixed(1)}%
                {" = "}
                <span className={`font-bold ${quality.className}`}>{sharpeRatio.toFixed(2)}</span>
              </p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              התשואה העודפת ({excessReturnPct.toFixed(1)}%) היא הרווח מעבר
              לחלופה חסרת סיכון. תנודתיות התיק לא מחושבת כממוצע פשוט של
              התנודתיות של כל אחזקה, אלא ממטריצת קורלציות בין האחזקות —
              אחזקות שנעות ביחד מגדילות את התנודתיות הכוללת יותר מאחזקות
              שלא מתואמות, גם אם לכל אחת מהן אותה תנודתיות בפני עצמה.
            </p>
          </section>

          <section>
            <p className="mb-1.5 text-sm font-bold text-slate-800">מה משפיע על היחס בתיק שלכם</p>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              הטבלה מפרקת את התנודתיות הכוללת של התיק לפי כל אחזקה — לא לפי
              משקלה בתיק בלבד, אלא לפי תרומתה בפועל לסיכון הכולל (תנודתיות
              עצמית ומידת המתאם שלה עם שאר האחזקות). הסכום של כל השורות
              מגיע ל-100% מהתנודתיות הכוללת.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-surface-border text-slate-500">
                    <th className="pb-1.5 font-medium">אחזקה</th>
                    <th className="pb-1.5 font-medium">משקל בתיק</th>
                    <th className="pb-1.5 font-medium">תנודתיות שנתית</th>
                    <th className="pb-1.5 font-medium">מתאם ממוצע עם השאר</th>
                    <th className="pb-1.5 font-medium">תרומה לסיכון התיק</th>
                  </tr>
                </thead>
                <tbody>
                  {contributions.map((c) => (
                    <tr key={c.ticker} className="border-b border-surface-border/60 last:border-0">
                      <td className="py-1.5 font-semibold text-slate-800">
                        {c.ticker} · {c.nameHe}
                      </td>
                      <td className="py-1.5 text-slate-700">{c.weightPct.toFixed(1)}%</td>
                      <td className="py-1.5 text-slate-700">{c.volatilityPct.toFixed(0)}%</td>
                      <td className="py-1.5 text-slate-700">{formatCorrelation(c.avgCorrelationWithRest)}</td>
                      <td
                        className={
                          c.contributionPct > c.weightPct * 1.15 && c.contributionPct >= 15
                            ? "py-1.5 font-bold text-negative"
                            : "py-1.5 font-bold text-slate-900"
                        }
                      >
                        {c.contributionPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-sm font-bold text-slate-800">מסקנות: מה לשפר ומה לשמר</p>
            <div className="space-y-2">
              {disproportionateContributors.length > 0 ? (
                disproportionateContributors.map((c) => (
                  <p key={c.ticker} className="text-sm leading-relaxed text-amber-400">
                    <span className="font-bold">לשפר: </span>
                    <span className="text-slate-700">
                      {c.ticker} ({c.nameHe}) אחראית ל-{c.contributionPct.toFixed(0)}% מהסיכון
                      הכולל של התיק — משמעותית יותר ממשקלה בתיק ({c.weightPct.toFixed(0)}%) —
                      בגלל שילוב של תנודתיות גבוהה ({c.volatilityPct.toFixed(0)}%)
                      {c.topCorrelatedTicker
                        ? ` ומתאם גבוה עם ${c.topCorrelatedTicker} (${formatCorrelation(c.topCorrelation)})`
                        : ""}
                      . צמצום מעט של המשקל, או הוספת אחזקה לא מתואמת לצדה, ישפרו את
                      יחס השארפ בלי לפגוע בתשואה הצפויה.
                    </span>
                  </p>
                ))
              ) : (
                <p className="text-sm leading-relaxed text-slate-700">
                  <span className="font-bold text-positive">לשפר: </span>
                  אין כרגע אחזקה בודדת שמייצרת סיכון לא פרופורציונלי למשקלה —
                  הסיכון בתיק מפוזר יחסית טוב בין האחזקות.
                </p>
              )}
              {biggestContributor && (
                <p className="text-sm leading-relaxed text-slate-700">
                  <span className="font-bold text-slate-900">התורם הגדול ביותר לסיכון: </span>
                  {biggestContributor.ticker} ({biggestContributor.nameHe}), עם{" "}
                  {biggestContributor.contributionPct.toFixed(0)}% מהתנודתיות הכוללת.
                </p>
              )}
              {smallestContributor && (
                <p className="text-sm leading-relaxed text-positive">
                  <span className="font-bold">לשמר: </span>
                  <span className="text-slate-700">
                    {smallestContributor.ticker} ({smallestContributor.nameHe}) תורמת רק{" "}
                    {smallestContributor.contributionPct.toFixed(1)}% מהסיכון הכולל למרות
                    משקל של {smallestContributor.weightPct.toFixed(1)}% בתיק — המתאם הנמוך
                    שלה עם שאר האחזקות ({formatCorrelation(smallestContributor.avgCorrelationWithRest)})
                    מספק גיוון אמיתי ומוריד את התנודתיות הכוללת. שווה לשמר אחזקה כזו
                    גם אם משקלה קטן.
                  </span>
                </p>
              )}
              <p className="text-sm leading-relaxed text-slate-700">
                <span className="font-bold text-slate-900">בשורה התחתונה: </span>
                יחס שארפ נוכחי של {sharpeRatio.toFixed(2)} נחשב{" "}
                <span className={quality.className}>{quality.labelHe}</span>.{" "}
                {sharpeRatio < 1
                  ? "השיפור המהיר ביותר כאן הוא לא בהכרח למכור אחזקות, אלא לצמצם את הריכוזיות במניות המתואמות ביניהן, שמנפחות את התנודתיות הכוללת בלי תרומה מקבילה לתשואה."
                  : "המצב הנוכחי סביר עד טוב — המשיכו לעקוב אחרי המתאמים בין האחזקות כשמוסיפים פוזיציות חדשות, כדי לא להגדיל בטעות ריכוזיות סמויה."}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
