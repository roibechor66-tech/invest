"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Info, Search, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { mockVolatilityByTicker } from "@/lib/mock-data/portfolio-risk";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { TickerSearchInput } from "@/components/dashboard/tools/TickerSearchInput";
import { getStockDetailSuggestions, TickerSuggestion } from "@/lib/ticker-search";

type OptionType = "call" | "put";

interface BsInputs {
  spot: number;
  strike: number;
  daysToExpiry: number;
  volatilityPct: number;
  riskFreeRatePct: number;
  dividendYieldPct: number;
  optionType: OptionType;
}

interface Greeks {
  price: number;
  intrinsicValue: number;
  timeValue: number;
  delta: number;
  gamma: number;
  theta: number; // per calendar day
  vega: number; // per 1 percentage-point change in IV
  rho: number; // per 1 percentage-point change in rate
}

// Standard normal CDF via the Abramowitz & Stegun erf approximation
// (accurate to ~1.5e-7 — plenty for a pricing calculator like this one).
function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Real Black-Scholes-Merton pricing + the five headline Greeks, with a
// continuous dividend yield term (q=0 for a non-dividend-paying stock).
// This is genuine, deterministic financial math — not an AI call and not
// mock data — so unlike the rest of the bot's "real AI" features, there
// is no ANTHROPIC_API_KEY dependency here at all: it runs entirely
// client-side. Also used to build the synthetic "contract chain" below
// (there is no live options-market feed in this app, so every quoted
// premium in the chain is this same formula, not a real bid/ask).
function blackScholes(inputs: BsInputs): Greeks {
  const { spot: S, strike: K, daysToExpiry, volatilityPct, riskFreeRatePct, dividendYieldPct, optionType } = inputs;
  const T = Math.max(daysToExpiry, 0) / 365;
  const sigma = Math.max(volatilityPct, 0) / 100;
  const r = riskFreeRatePct / 100;
  const q = dividendYieldPct / 100;

  const intrinsicValue = optionType === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);

  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return {
      price: intrinsicValue,
      intrinsicValue,
      timeValue: 0,
      delta: optionType === "call" ? (S > K ? 1 : 0) : S < K ? -1 : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const discQ = Math.exp(-q * T);
  const discR = Math.exp(-r * T);

  let price: number;
  let delta: number;
  let rho: number;

  if (optionType === "call") {
    price = S * discQ * normCdf(d1) - K * discR * normCdf(d2);
    delta = discQ * normCdf(d1);
    rho = (K * T * discR * normCdf(d2)) / 100; // per 1 percentage-point rate move
  } else {
    price = K * discR * normCdf(-d2) - S * discQ * normCdf(-d1);
    delta = -discQ * normCdf(-d1);
    rho = (-K * T * discR * normCdf(-d2)) / 100;
  }

  const gamma = (discQ * normPdf(d1)) / (S * sigma * Math.sqrt(T));
  const vega = (S * discQ * normPdf(d1) * Math.sqrt(T)) / 100; // per 1 percentage-point IV move

  // Theta, converted from "per year" to "per calendar day" — the number
  // traders actually think in ("how much value do I lose by tomorrow").
  const thetaTerm1 = -(S * discQ * normPdf(d1) * sigma) / (2 * Math.sqrt(T));
  const thetaYear =
    optionType === "call"
      ? thetaTerm1 - r * K * discR * normCdf(d2) + q * S * discQ * normCdf(d1)
      : thetaTerm1 + r * K * discR * normCdf(-d2) - q * S * discQ * normCdf(-d1);
  const theta = thetaYear / 365;

  const timeValue = Math.max(price - intrinsicValue, 0);

  return { price, intrinsicValue, timeValue, delta, gamma, theta, vega, rho };
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("he-IL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtSigned(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${fmt(Math.abs(n), digits)}`;
}

const EXPIRY_PRESETS = [
  { label: "שבועי", days: 7 },
  { label: "שבועיים", days: 14 },
  { label: "חודש", days: 30 },
  { label: "חודשיים", days: 60 },
  { label: "3 חודשים", days: 90 },
];

const STRIKE_OFFSETS_PCT = [-10, -5, -2.5, 0, 2.5, 5, 10];

const SCENARIO_PRESETS_PCT = [-20, -10, -5, -2, 2, 5, 10, 20];

function NumberField({
  label,
  value,
  onChange,
  step = "any",
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          className="w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
          dir="ltr"
        />
        {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
      </div>
      {hint && <span className="text-[11px] leading-relaxed text-slate-500">{hint}</span>}
    </label>
  );
}

function GreekRow({ label, value, explanation }: { label: string; value: string; explanation: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        <span className="font-mono text-sm font-bold text-brand-300" dir="ltr">
          {value}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{explanation}</p>
    </div>
  );
}

function ExplainerSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 p-3 text-right"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <HelpCircle size={16} className="text-brand-400" />
          לא מכירים אופציות? הסבר פשוט למתחילים
        </span>
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-surface-border p-4 text-xs leading-relaxed text-slate-700">
          <div>
            <p className="font-semibold text-slate-900">מה זו בכלל אופציה?</p>
            <p className="mt-1 text-slate-500">
              אופציה היא חוזה שנותן לכם את <b>הזכות</b> (אבל לא את החובה) לקנות
              או למכור מניה במחיר קבוע מראש ("מחיר מימוש"), עד תאריך מסוים
              ("פקיעה"). כל חוזה מייצג 100 מניות. במקום לשלם את המחיר המלא של
              המניה, משלמים סכום קטן יחסית ("פרמיה") על הזכות הזו בלבד.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">CALL (קול) לעומת PUT (פוט)</p>
            <p className="mt-1 text-slate-500">
              <b>CALL</b> = הימור/הגנה על <b>עלייה</b> במחיר המניה — קונים
              קול כשחושבים שהמניה תעלה מעל מחיר המימוש עד הפקיעה. <b>PUT</b> =
              הימור/הגנה על <b>ירידה</b> — קונים פוט כשחושבים שהמניה תרד מתחת
              למחיר המימוש.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">ערך פנימי מול ערך זמן</p>
            <p className="mt-1 text-slate-500">
              <b>ערך פנימי</b> = כמה החוזה "שווה" כרגע אם היינו ממשים אותו
              מיד (למשל, קול עם strike 100 כשהמניה ב-110 שווה לפחות 10$).{" "}
              <b>ערך זמן</b> = התוספת שמעבר לזה, שמשקפת את הסיכוי שהמצב עוד
              ישתפר עד הפקיעה — ותמיד יורד ל-0 עד יום הפקיעה עצמו.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">מקסימום הפסד ונקודת איזון</p>
            <p className="mt-1 text-slate-500">
              כשקונים אופציה (במקום למכור אותה), <b>ההפסד המקסימלי מוגבל
              לפרמיה ששילמתם</b> — גם אם המניה זזה נגדכם בחוזקה, לא תפסידו
              יותר מזה. <b>נקודת האיזון</b> היא המחיר שבו בדיוק מכסים את
              עלות הפרמיה בפקיעה — מעליה (בקול) או מתחתיה (בפוט) אתם ברווח.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">ומה זה "היוונים" (Greeks)?</p>
            <p className="mt-1 text-slate-500">
              ה-Greeks הם מספרים שאומרים כמה מחיר האופציה <b>רגיש</b> לכל
              גורם שיכול להשתנות — מחיר המניה (Delta, Gamma), הזמן שעובר
              (Theta), התנודתיות הצפויה (Vega) והריבית (Rho). כל אחד מוסבר
              בנפרד למטה, ליד המספר שלו.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Bot feature "מחשבון אופציות": a real, deterministic Black-Scholes-Merton
// calculator built to feel like an actual options trading screen rather
// than a bare formula box — pick a ticker (auto-fills a mock spot price
// and a per-ticker volatility assumption, same mock data the rest of the
// risk tools use), pick CALL or PUT, pick an expiration, then pick a
// specific strike from a small theoretical "chain" (there's no live
// options-market feed in this app, so every premium shown is computed by
// this same Black-Scholes formula, not a real bid/ask quote — stated
// plainly in the UI). Once a contract is picked, the panel shows the
// trade's max loss, breakeven, profit zone, every Greek, and a full
// price-move scenario table (a preset % grid plus one free-typed %) so
// the person can see exactly what the contract is worth and what they'd
// make or lose if the stock moves. A collapsible plain-Hebrew explainer
// covers both what an option even is and what each Greek means, for
// anyone unfamiliar. No ANTHROPIC_API_KEY dependency — it's just math.
export function OptionsCalculatorPanel({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [spot, setSpot] = useState<number>(NaN);
  const [volatilityPct, setVolatilityPct] = useState<number>(35);
  const [riskFreeRatePct, setRiskFreeRatePct] = useState<number>(4.5);
  const [dividendYieldPct, setDividendYieldPct] = useState<number>(0);
  const [optionType, setOptionType] = useState<OptionType>("call");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [premiumOverride, setPremiumOverride] = useState<number | null>(null);
  const [contracts, setContracts] = useState<number>(1);
  const [customScenarioPct, setCustomScenarioPct] = useState<number>(15);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const hasUserEditedSpot = useRef(false);

  const { quote, isLoading: isQuoteLoading } = useLiveQuote(selectedTicker);

  // Auto-fill the spot price once a live quote arrives for the selected
  // ticker (and keep it in sync as the quote refreshes) — but never
  // overwrite a price the user already typed manually. If no live quote
  // is available once loading settles, fall back to the old "not found"
  // messaging, which already told the user to type a price themselves.
  useEffect(() => {
    if (!selectedTicker || isQuoteLoading) return;
    if (quote) {
      setNotFound(false);
      if (!hasUserEditedSpot.current) {
        setSpot(quote.price);
      }
    } else {
      setNotFound(true);
    }
  }, [quote, isQuoteLoading, selectedTicker]);

  function handleSpotChange(value: number) {
    hasUserEditedSpot.current = true;
    setSpot(value);
  }

  function handleSearch(rawQuery: string = query) {
    const ticker = rawQuery.trim().toUpperCase();
    if (!ticker) return;
    const detail =
      mockStockDetails[ticker] ?? Object.values(mockStockDetails).find((d) => d.ticker.toUpperCase() === ticker);
    const resolvedTicker = detail?.ticker ?? ticker;

    hasUserEditedSpot.current = false;
    setNotFound(false);
    setSelectedTicker(resolvedTicker);
    setQuery(resolvedTicker);
    setVolatilityPct(mockVolatilityByTicker[resolvedTicker] ?? 35);
    setExpiryDays(null);
    setSelectedStrike(null);
    setPremiumOverride(null);
    // Re-searching the same ticker won't re-trigger the quote effect
    // above (the ticker didn't change) — apply the already-fetched quote
    // directly so the spot price still resets on a repeat search.
    if (selectedTicker === resolvedTicker && quote) {
      setSpot(quote.price);
    }
  }

  function handleSelectSuggestion(suggestion: TickerSuggestion) {
    handleSearch(suggestion.ticker);
  }

  const suggestions = getStockDetailSuggestions(query);

  const spotValid = Number.isFinite(spot) && spot > 0;

  // The synthetic contract "chain" for the currently chosen expiration —
  // a handful of strikes around the spot price, each priced with the
  // same Black-Scholes formula. This is a calculator, not a live market
  // feed, so these are theoretical fair values, never real bid/ask.
  const chain = useMemo(() => {
    if (!spotValid || expiryDays === null) return [];
    return STRIKE_OFFSETS_PCT.map((pct) => {
      const strike = Math.round((spot * (1 + pct / 100)) * 100) / 100;
      const greeks = blackScholes({ spot, strike, daysToExpiry: expiryDays, volatilityPct, riskFreeRatePct, dividendYieldPct, optionType });
      return { strike, pct, price: greeks.price };
    });
  }, [spotValid, spot, expiryDays, volatilityPct, riskFreeRatePct, dividendYieldPct, optionType]);

  function pickContract(strike: number, theoreticalPrice: number) {
    setSelectedStrike(strike);
    setPremiumOverride(Math.round(theoreticalPrice * 100) / 100);
  }

  const contractChosen = spotValid && expiryDays !== null && selectedStrike !== null && premiumOverride !== null;

  const liveGreeks = useMemo(() => {
    if (!contractChosen) return null;
    return blackScholes({
      spot,
      strike: selectedStrike as number,
      daysToExpiry: expiryDays as number,
      volatilityPct,
      riskFreeRatePct,
      dividendYieldPct,
      optionType,
    });
  }, [contractChosen, spot, selectedStrike, expiryDays, volatilityPct, riskFreeRatePct, dividendYieldPct, optionType]);

  const premium = premiumOverride ?? 0;
  const contractsNum = Number.isFinite(contracts) && contracts > 0 ? contracts : 1;
  const maxLoss = premium * 100 * contractsNum;
  const breakeven = contractChosen
    ? optionType === "call"
      ? (selectedStrike as number) + premium
      : (selectedStrike as number) - premium
    : null;

  function scenarioRow(pct: number) {
    if (!contractChosen) return null;
    const newSpot = spot * (1 + pct / 100);
    const intrinsicAtExpiry = optionType === "call" ? Math.max(newSpot - (selectedStrike as number), 0) : Math.max((selectedStrike as number) - newSpot, 0);
    const plAtExpiry = (intrinsicAtExpiry - premium) * 100 * contractsNum;
    const returnAtExpiryPct = premium > 0 ? ((intrinsicAtExpiry - premium) / premium) * 100 : null;

    const todayGreeks = blackScholes({
      spot: newSpot,
      strike: selectedStrike as number,
      daysToExpiry: expiryDays as number,
      volatilityPct,
      riskFreeRatePct,
      dividendYieldPct,
      optionType,
    });
    const plToday = (todayGreeks.price - premium) * 100 * contractsNum;
    const returnTodayPct = premium > 0 ? ((todayGreeks.price - premium) / premium) * 100 : null;

    return { pct, newSpot, intrinsicAtExpiry, plAtExpiry, returnAtExpiryPct, todayValue: todayGreeks.price, plToday, returnTodayPct };
  }

  const scenarioRows = SCENARIO_PRESETS_PCT.map(scenarioRow).filter((r): r is NonNullable<typeof r> => r !== null);
  const customRow = scenarioRow(customScenarioPct);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        חזרה לתפריט הבוט
      </button>

      <p className="text-sm leading-relaxed text-slate-500">
        מחשבון אופציות ברמת מסך מסחר אמיתי: בחרו מניה, כיוון (CALL/PUT),
        תאריך פקיעה וחוזה ספציפי — ותקבלו מקסימום הפסד, נקודת איזון, כל
        ה"היוונים" (Greeks), וטבלת תרחישים שמראה בדיוק כמה תרוויחו או
        תפסידו אם המניה תזוז באחוזים שונים.
      </p>

      <ExplainerSection open={explainerOpen} onToggle={() => setExplainerOpen((v) => !v)} />

      {/* Step 1: ticker */}
      <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">1. בחרו מניה</p>
        <div className="flex gap-2">
          <TickerSearchInput
            value={query}
            onChange={setQuery}
            suggestions={suggestions}
            onSelectSuggestion={handleSelectSuggestion}
            onSubmit={(v) => handleSearch(v)}
            placeholder="הקלידו טיקר, למשל NVDA"
            inputClassName="w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => handleSearch()}
            className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Search size={14} />
            חפש
          </button>
        </div>
        {selectedTicker && isQuoteLoading && (
          <p className="mt-2 text-xs text-slate-400">טוען ציטוט חי...</p>
        )}
        {notFound && (
          <p className="mt-2 text-xs text-negative">
            אין ציטוט חי לטיקר הזה — הזינו מחיר מניה ידנית למטה, או נסו אחד מהדוגמאות: NVDA, MSFT, TSM, VRT, AAPL, GOOGL, AMZN, TSLA.
          </p>
        )}
        {selectedTicker && spotValid && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-surface-card p-2.5">
            <span className="font-mono text-sm font-bold text-slate-900" dir="ltr">
              {selectedTicker}
            </span>
            <span className="text-xs text-slate-500">מחיר נוכחי:</span>
            <span className="font-mono text-sm font-bold text-brand-300" dir="ltr">
              ${fmt(spot)}
            </span>
            <span className="text-xs text-slate-500">(ניתן לערוך את המחיר ואת התנודתיות למטה)</span>
          </div>
        )}
        {selectedTicker && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <NumberField label="מחיר המניה" value={spot} onChange={handleSpotChange} suffix="$" />
            <NumberField label="תנודתיות גלומה (IV)" value={volatilityPct} onChange={setVolatilityPct} suffix="%" />
            <NumberField label="ריבית חסרת סיכון" value={riskFreeRatePct} onChange={setRiskFreeRatePct} suffix="%" />
          </div>
        )}
      </div>

      {/* Step 2: direction */}
      {selectedTicker && spotValid && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">2. כיוון</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOptionType("call");
                setSelectedStrike(null);
                setPremiumOverride(null);
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                optionType === "call" ? "bg-positive/15 text-positive" : "bg-surface-card text-slate-500 hover:text-slate-800"
              }`}
            >
              CALL (קול) — הימור על עלייה
            </button>
            <button
              type="button"
              onClick={() => {
                setOptionType("put");
                setSelectedStrike(null);
                setPremiumOverride(null);
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                optionType === "put" ? "bg-negative/15 text-negative" : "bg-surface-card text-slate-500 hover:text-slate-800"
              }`}
            >
              PUT (פוט) — הימור על ירידה
            </button>
          </div>
        </div>
      )}

      {/* Step 3: expiration */}
      {selectedTicker && spotValid && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">3. תאריך פקיעה</p>
          <div className="flex flex-wrap gap-2">
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => {
                  setExpiryDays(p.days);
                  setSelectedStrike(null);
                  setPremiumOverride(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  expiryDays === p.days ? "bg-brand-500 text-white" : "bg-surface-card text-slate-500 hover:text-slate-800"
                }`}
              >
                {p.label} ({p.days} ימים)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: strike / contract chain */}
      {selectedTicker && spotValid && expiryDays !== null && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-700">4. בחרו חוזה (מחיר מימוש)</p>
          <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
            אלו מחירים תיאורטיים שמחושבים באותה נוסחה, לא ציטוטי שוק בזמן אמת (אין כאן פיד אופציות חי) — אפשר לערוך את הפרמיה בפועל אחרי הבחירה.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {chain.map((c) => (
              <button
                key={c.strike}
                type="button"
                onClick={() => pickContract(c.strike, c.price)}
                className={`rounded-lg border p-2 text-center transition ${
                  selectedStrike === c.strike
                    ? "border-brand-500 bg-brand-500/15"
                    : "border-surface-border bg-surface-card hover:border-brand-500/50"
                }`}
              >
                <p className="font-mono text-sm font-bold text-slate-900" dir="ltr">
                  ${fmt(c.strike, 0)}
                </p>
                <p className="text-[10px] text-slate-500">{c.pct === 0 ? "ATM" : c.pct > 0 ? `+${c.pct}%` : `${c.pct}%`}</p>
                <p className="mt-1 font-mono text-xs text-brand-300" dir="ltr">
                  ${fmt(c.price)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: results */}
      {contractChosen && liveGreeks && (
        <div className="space-y-4 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="פרמיה בפועל (לחוזה, ניתן לעריכה)"
              value={premium}
              onChange={(v) => setPremiumOverride(Number.isFinite(v) ? v : null)}
              suffix="$"
              hint="מולא אוטומטית מהמחיר התיאורטי — אפשר לשנות למחיר שראיתם בפועל אצל הברוקר"
            />
            <NumberField label="מספר חוזים" value={contracts} onChange={setContracts} step="1" hint="כל חוזה = 100 מניות" />
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <Calculator size={16} />
            </span>
            <div>
              <p className="text-xs text-slate-500">
                {selectedTicker} {optionType === "call" ? "CALL" : "PUT"} ${fmt(selectedStrike as number, 0)} · {expiryDays} ימים לפקיעה
              </p>
              <p className="font-mono text-2xl font-bold text-slate-900" dir="ltr">
                ${fmt(liveGreeks.price)} <span className="text-xs font-normal text-slate-500">מחיר תיאורטי כרגע</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-negative/30 bg-negative/10 p-2.5 text-center">
              <p className="text-[11px] text-slate-500">מקסימום הפסד</p>
              <p className="font-mono text-sm font-bold text-negative" dir="ltr">
                -${fmt(maxLoss)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">אם החוזה פוקע חסר-ערך</p>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-card p-2.5 text-center">
              <p className="text-[11px] text-slate-500">נקודת איזון בפקיעה</p>
              <p className="font-mono text-sm font-bold text-slate-900" dir="ltr">
                ${fmt(breakeven as number)}
              </p>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-card p-2.5 text-center">
              <p className="text-[11px] text-slate-500">ברווח כאשר המניה</p>
              <p className="text-xs font-bold text-slate-900" dir="ltr">
                {optionType === "call" ? `> $${fmt(breakeven as number)}` : `< $${fmt(breakeven as number)}`}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              היוונים (Greeks) — כמה רגיש המחיר לכל גורם
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <GreekRow
                label="Delta (דלתא)"
                value={fmt(liveGreeks.delta, 3)}
                explanation="כמה משתנה מחיר האופציה כשהמניה זזה 1$. דלתא 0.5 = האופציה תזוז בערך 50 סנט על כל 1$ תנועה במניה."
              />
              <GreekRow
                label="Gamma (גאמה)"
                value={fmt(liveGreeks.gamma, 4)}
                explanation="קצב השינוי של הדלתא עצמה. גאמה גבוהה = הדלתא תזוז מהר ככל שהמניה זזה, בעיקר קרוב לפקיעה ולמחיר המימוש."
              />
              <GreekRow
                label="Theta (תטא)"
                value={`${fmt(liveGreeks.theta)} $/יום`}
                explanation="כמה שווי מאבדת האופציה כל יום שעובר, בהנחה שכל שאר הגורמים נשארים קבועים ('שחיקת זמן')."
              />
              <GreekRow
                label="Vega (וגה)"
                value={fmt(liveGreeks.vega)}
                explanation="כמה משתנה מחיר האופציה כשהתנודתיות הגלומה (IV) עולה ב-1 נקודת אחוז. וגה גבוהה = רגישות גבוהה לשינויי IV."
              />
              <GreekRow
                label="Rho (רו)"
                value={fmt(liveGreeks.rho)}
                explanation="כמה משתנה מחיר האופציה כשהריבית חסרת הסיכון עולה ב-1 נקודת אחוז — בדרך כלל הכי פחות משמעותי מבין ה-Greeks לטווח קצר."
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
              מה קורה אם המניה זזה ב-X%?
            </p>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              "עכשיו" = השווי התיאורטי אם המהלך יקרה מיד (אותם ימים לפקיעה). "בפקיעה" = הערך הפנימי בלבד, אם החוזה יגיע לפקיעה במחיר הזה בדיוק.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs" dir="rtl">
                <thead>
                  <tr className="text-slate-500">
                    <th className="p-1.5 text-right font-medium">שינוי</th>
                    <th className="p-1.5 text-right font-medium">מחיר מניה חדש</th>
                    <th className="p-1.5 text-right font-medium">שווי עכשיו</th>
                    <th className="p-1.5 text-right font-medium">רווח/הפסד עכשיו</th>
                    <th className="p-1.5 text-right font-medium">ערך בפקיעה</th>
                    <th className="p-1.5 text-right font-medium">רווח/הפסד בפקיעה</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioRows.map((r) => (
                    <tr key={r.pct} className="border-t border-surface-border">
                      <td className="p-1.5 font-mono" dir="ltr">
                        {r.pct > 0 ? `+${r.pct}%` : `${r.pct}%`}
                      </td>
                      <td className="p-1.5 font-mono text-slate-700" dir="ltr">
                        ${fmt(r.newSpot)}
                      </td>
                      <td className="p-1.5 font-mono text-slate-700" dir="ltr">
                        ${fmt(r.todayValue)}
                      </td>
                      <td className={`p-1.5 font-mono font-semibold ${r.plToday >= 0 ? "text-positive" : "text-negative"}`} dir="ltr">
                        {fmtSigned(r.plToday)}$
                      </td>
                      <td className="p-1.5 font-mono text-slate-700" dir="ltr">
                        ${fmt(r.intrinsicAtExpiry)}
                      </td>
                      <td className={`p-1.5 font-mono font-semibold ${r.plAtExpiry >= 0 ? "text-positive" : "text-negative"}`} dir="ltr">
                        {fmtSigned(r.plAtExpiry)}$
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-800">תרחיש מותאם אישית</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">אם המניה תזוז ב-</span>
              <input
                type="number"
                value={Number.isFinite(customScenarioPct) ? customScenarioPct : ""}
                onChange={(e) => setCustomScenarioPct(e.target.value === "" ? NaN : Number(e.target.value))}
                className="w-20 rounded-lg border border-surface-border bg-surface-card px-2 py-1 text-center text-sm text-slate-900 outline-none focus:border-brand-500"
                dir="ltr"
              />
              <span className="text-xs text-slate-500">%</span>
            </div>
            {customRow && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="rounded-lg bg-surface-card p-2">
                  <p className="text-[10px] text-slate-500">מחיר חדש</p>
                  <p className="font-mono text-xs font-bold text-slate-900" dir="ltr">
                    ${fmt(customRow.newSpot)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-card p-2">
                  <p className="text-[10px] text-slate-500">שווי עכשיו</p>
                  <p className="font-mono text-xs font-bold text-slate-900" dir="ltr">
                    ${fmt(customRow.todayValue)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-card p-2">
                  <p className="text-[10px] text-slate-500">רווח/הפסד עכשיו</p>
                  <p className={`font-mono text-xs font-bold ${customRow.plToday >= 0 ? "text-positive" : "text-negative"}`} dir="ltr">
                    {fmtSigned(customRow.plToday)}$
                  </p>
                </div>
                <div className="rounded-lg bg-surface-card p-2">
                  <p className="text-[10px] text-slate-500">רווח/הפסד בפקיעה</p>
                  <p className={`font-mono text-xs font-bold ${customRow.plAtExpiry >= 0 ? "text-positive" : "text-negative"}`} dir="ltr">
                    {fmtSigned(customRow.plAtExpiry)}$
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-1.5 rounded-lg border border-surface-border bg-surface-card p-2.5 text-[11px] leading-relaxed text-slate-500">
            <Info size={12} className="mt-0.5 shrink-0 text-slate-500" />
            <span>
              זהו מודל תיאורטי (Black-Scholes-Merton) שמניח תנודתיות קבועה
              ושוק יעיל — המחיר בפועל בשוק (bid/ask) עשוי להיות שונה, במיוחד
              באופציות עם נזילות נמוכה. הכלי הזה עוזר להבין תמחור, סיכון
              והיוונים, אך אינו ייעוץ השקעות ואינו מחליף בדיקת המחיר בפועל
              אצל הברוקר.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
