"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";

interface ExpectancyResult {
  expectancy_r: number;
  expectancy_usd: number | null;
  profit_factor: number | null;
}

// The question that actually decides whether a trading strategy makes
// money long-run — not "how often do I win?" but "what do I make per
// trade, on average, once wins and losses are weighed by their size?".
// A 70%-win-rate strategy with small wins and rare-but-huge losses can
// still have negative expectancy; a 35%-win-rate strategy with big wins
// and small losses can be strongly profitable. Everything is expressed
// in R (multiples of what was risked on the trade) so it doesn't depend
// on position size.
export function TradeExpectancyCalculator() {
  const [winRatePct, setWinRatePct] = useState("50");
  const [avgWinR, setAvgWinR] = useState("2");
  const [avgLossR, setAvgLossR] = useState("1");
  const [avgRiskUsd, setAvgRiskUsd] = useState("");
  const [result, setResult] = useState<ExpectancyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<ExpectancyResult>("/api/risk/expectancy", {
        method: "POST",
        body: JSON.stringify({
          win_rate_pct: Number(winRatePct),
          avg_win_r: Number(avgWinR),
          avg_loss_r: Number(avgLossR),
          avg_risk_usd: avgRiskUsd ? Number(avgRiskUsd) : undefined,
        }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החישוב נכשל");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  const verdict =
    result === null
      ? null
      : result.expectancy_r > 0.2
        ? { labelHe: "יתרון (edge) ברור", className: "text-positive" }
        : result.expectancy_r > 0
          ? { labelHe: "יתרון חיובי אבל צנוע", className: "text-amber-400" }
          : { labelHe: "יתרון שלילי — האסטרטגיה מפסידה בטווח הארוך", className: "text-negative" };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        הזינו את סטטיסטיקת האסטרטגיה שלכם (מתוך יומן מסחר, לא הערכה) —
        כמה אחוז מהעסקאות מרוויחות, וכמה גדולות הזכיות וההפסדים בממוצע
        ביחידות R (כפולות של הסיכון ההתחלתי בעסקה). זה מראה אם יש בכלל
        יתרון סטטיסטי, בלי קשר לתחושה הסובייקטיבית מהעסקה האחרונה.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="אחוז עסקאות מנצחות (%)" value={winRatePct} onChange={setWinRatePct} step="1" />
        <FormField label="זכייה ממוצעת (R)" value={avgWinR} onChange={setAvgWinR} step="0.1" />
        <FormField label="הפסד ממוצע (R)" value={avgLossR} onChange={setAvgLossR} step="0.1" />
        <FormField
          label="סיכון ממוצע לעסקה ($, אופציונלי)"
          value={avgRiskUsd}
          onChange={setAvgRiskUsd}
          placeholder="להצגת ציפייה גם בדולרים"
        />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading || !winRatePct || !avgWinR || !avgLossR}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב Expectancy"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && verdict && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow
            label="ציפייה לעסקה (Expectancy)"
            value={`${result.expectancy_r >= 0 ? "+" : ""}${result.expectancy_r.toFixed(2)}R`}
            emphasize
          />
          {result.expectancy_usd !== null && (
            <ResultRow
              label="ציפייה לעסקה בדולרים"
              value={`${result.expectancy_usd >= 0 ? "+" : ""}$${result.expectancy_usd.toFixed(0)}`}
            />
          )}
          {result.profit_factor !== null && (
            <ResultRow label="Profit Factor" value={result.profit_factor.toFixed(2)} />
          )}
          <p className={`mt-2 text-sm font-bold ${verdict.className}`}>{verdict.labelHe}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            ציפייה חיובית אומרת שבממוצע, לאורך מספיק עסקאות, האסטרטגיה
            מרוויחה — גם אם עסקאות בודדות מפסידות. ציפייה שלילית אומרת
            שגם רצף זכיות מקרי לא הופך אותה לרווחית לאורך זמן.
          </p>
        </div>
      )}
    </div>
  );
}
