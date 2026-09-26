"use client";

import { useState } from "react";
import { ArrowRight, LineChart, ShieldCheck } from "lucide-react";
import { ToolTabs } from "@/components/dashboard/tools/ToolTabs";
import { PositionSizeCalculator } from "@/components/dashboard/tools/PositionSizeCalculator";
import { TradeRiskCalculator } from "@/components/dashboard/tools/TradeRiskCalculator";
import { RiskRewardCalculator } from "@/components/dashboard/tools/RiskRewardCalculator";
import { VolatilityStopCalculator } from "@/components/dashboard/tools/VolatilityStopCalculator";
import { TradeExpectancyCalculator } from "@/components/dashboard/tools/TradeExpectancyCalculator";
import { InvestingRiskPanel } from "@/components/dashboard/tools/InvestingRiskPanel";

const TRADING_TABS = [
  { id: "position-size", labelHe: "גודל פוזיציה" },
  { id: "trade-risk", labelHe: "סיכון לעסקה" },
  { id: "risk-reward", labelHe: "סיכון/סיכוי" },
  { id: "volatility-stop", labelHe: "סטופ לפי תנודתיות" },
  { id: "expectancy", labelHe: "Expectancy אסטרטגיה" },
];

type RiskMode = "trading" | "investing" | null;

// Risk management splits into two distinct mindsets: a swing trader
// sizing a single trade (position size / risk-reward, unchanged from
// before) vs. a long-term investor asking what a price move in one
// holding does to the whole portfolio. The user picks a mode first;
// each mode keeps its own state so switching between them doesn't lose
// anything already calculated.
export function RiskManagementPanel() {
  const [mode, setMode] = useState<RiskMode>(null);
  const [tradingTab, setTradingTab] = useState(TRADING_TABS[0].id);

  if (mode === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("trading")}
          className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
            <LineChart size={20} />
          </span>
          <span className="text-base font-bold text-slate-900">מסחר (סווינג)</span>
          <span className="text-sm text-slate-500">
            ניהול סיכונים לעסקה בודדת: גודל פוזיציה לפי אחוז סיכון מהתיק,
            כמה כסף בסיכון לפי סטופ-לוס נתון, יחס סיכון/סיכוי מול מחיר יעד,
            סטופ-לוס מבוסס תנודתיות, ובדיקת ה-Expectancy של האסטרטגיה שלכם.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("investing")}
          className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
            <ShieldCheck size={20} />
          </span>
          <span className="text-base font-bold text-slate-900">השקעות</span>
          <span className="text-sm text-slate-500">
            ניהול סיכונים ברמת התיק: בטא, תנודתיות ו-VaR, יחס שארפ לפי
            מטריצת קורלציות בין האחזקות, ריכוזיות והחשיפה הסקטוריאלית
            הגדולה, תרחיש למניה בודדת, ותרחישי שוק מוכנים לפי הבטא של התיק.
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setMode(null)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowRight size={14} />
        חזרה לבחירת סוג ניהול סיכונים
      </button>

      {mode === "trading" ? (
        <>
          <ToolTabs tabs={TRADING_TABS} activeId={tradingTab} onChange={setTradingTab} />
          {tradingTab === "position-size" && <PositionSizeCalculator />}
          {tradingTab === "trade-risk" && <TradeRiskCalculator />}
          {tradingTab === "risk-reward" && <RiskRewardCalculator />}
          {tradingTab === "volatility-stop" && <VolatilityStopCalculator />}
          {tradingTab === "expectancy" && <TradeExpectancyCalculator />}
        </>
      ) : (
        <InvestingRiskPanel />
      )}
    </div>
  );
}
