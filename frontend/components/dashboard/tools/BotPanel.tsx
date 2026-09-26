"use client";

import { useState } from "react";
import { Newspaper, FileSearch, BellRing, Compass, LineChart, Radar, Calculator, GitCompare } from "lucide-react";
import { BriefTypeStep } from "@/components/dashboard/tools/bot/BriefTypeStep";
import { DailyBrief } from "@/components/dashboard/tools/bot/DailyBrief";
import { WeeklyBrief } from "@/components/dashboard/tools/bot/WeeklyBrief";
import { TrendAnalysisPanel } from "@/components/dashboard/tools/TrendAnalysisPanel";
import { EconomicTrendsPanel } from "@/components/dashboard/tools/EconomicTrendsPanel";
import { AutomatedReportAnalysisPanel } from "@/components/dashboard/tools/AutomatedReportAnalysisPanel";
import { CustomAlertsPanel } from "@/components/dashboard/tools/CustomAlertsPanel";
import { StockScannerPanel } from "@/components/dashboard/tools/StockScannerPanel";
import { OptionsCalculatorPanel } from "@/components/dashboard/tools/OptionsCalculatorPanel";
import { CorrelationCheckerPanel } from "@/components/dashboard/tools/CorrelationCheckerPanel";

type BotStep =
  | "hub"
  | "brief-type"
  | "daily-brief"
  | "weekly-brief"
  | "trend-analysis"
  | "economic-trends"
  | "automated-report-analysis"
  | "custom-alerts"
  | "stock-scanner"
  | "options-calculator"
  | "correlation-checker";

// Entry point for the AI bot: a hub of roles it can take on, starting
// with briefs (the only role actually built so far) and leaving room for
// more later without changing this screen's shape. Each additional role
// is just another card here, wired to its own sub-flow.
export function BotPanel() {
  const [step, setStep] = useState<BotStep>("hub");

  if (step === "hub") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          לבוט יש כמה תפקידים — בחרו אחד. תפקידים נוספים יתווספו כאן בהמשך.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setStep("brief-type")}
            className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <Newspaper size={20} />
            </span>
            <span className="text-base font-bold text-slate-900">בריפים</span>
            <span className="text-sm text-slate-500">
              בריף יומי (מה היה אתמול, מה צפוי היום) או בריף שבועי (אירועים
              כלכליים, מגמות מאקרו וסקטורים בולטים), עם תשואות מדדים
              והשוואת התיק שלכם מול מדד רלוונטי.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("trend-analysis")}
            className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <LineChart size={20} />
            </span>
            <span className="text-base font-bold text-slate-900">ניתוח מגמות</span>
            <span className="text-sm text-slate-500">
              חיפוש אינטרנט חי אחר white papers של חברות גדולות, ניתוחי צווארי
              בקבוק וטכנולוגיות חדשות, והחברות/הסקטורים שעלולים מושפעים
              משיבוש שוק (market disruption).
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("economic-trends")}
            className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <Compass size={20} />
            </span>
            <span className="text-base font-bold text-slate-900">מגמות כלכלה</span>
            <span className="text-sm text-slate-500">
              ניתוח חי של מה שמשפיע על הכלכלה והשווקים האמריקאיים, לאן הם
              צפויים להתקדם, מצב הצרכן, ואירועים כלכליים כמו אבטלה, ייצור
              וצמיחה.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("automated-report-analysis")}
            className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <FileSearch size={20} />
            </span>
            <span className="text-base font-bold text-slate-900">ניתוח דוחות אוטומטי</span>
            <span className="text-sm text-slate-500">
              בחרו מניה מהתיק שלכם — הבוט יאתר את הדוח (10-K/10-Q) האחרון
              שהוגש בפועל ל-SEC, ותוכלו לנתח אותו בלחיצת כפתור.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("stock-scanner")}
            className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <Radar size={20} />
            </span>
            <span className="text-base font-bold text-slate-900">סורק מניות</span>
            <span className="text-sm text-slate-500">
              המניות הכי טרנדיות כרגע, פריצות מומנטום עם באז אמיתי ברשתות
              החברתיות, ומניות עם סימנים ציבוריים לצבירה מוסדית/פנימית
              ("כסף חכם").
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("options-calculator")}
            className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <Calculator size={20} />
            </span>
            <span className="text-base font-bold text-slate-900">מחשבון אופציות</span>
            <span className="text-sm text-slate-500">
              תמחור אופציות ברמה גבוהה (Black-Scholes) עם כל ה"היוונים"
              (Greeks) — מחיר תיאורטי, דלתא, גאמה, תטא, וגה ורו — בממשק
              פשוט להזנה.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("correlation-checker")}
            className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <GitCompare size={20} />
            </span>
            <span className="text-base font-bold text-slate-900">בדיקת קורלציה</span>
            <span className="text-sm text-slate-500">
              חפשו כל שני נכסים — מניה, מדד, סקטור, אג&quot;ח או סחורה —
              וקבלו מקדם קורלציה לתקופה שתבחרו, יחד עם ניתוח שמסביר מה
              קורה, למה, איך זה משפיע ומה ניתן להסיק.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("custom-alerts")}
            className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <BellRing size={20} />
            </span>
            <span className="text-base font-bold text-slate-900">התראות מותאמות אישית</span>
            <span className="text-sm text-slate-500">
              בחרו אילו התראות מעניינות אתכם (תנועת מחיר, דוח חדש, אזכור
              במגמות, שינוי מאקרו) ואיפה לקבל אותן — באתר ו/או באימייל.
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (step === "trend-analysis") {
    return <TrendAnalysisPanel onBack={() => setStep("hub")} />;
  }

  if (step === "economic-trends") {
    return <EconomicTrendsPanel onBack={() => setStep("hub")} />;
  }

  if (step === "automated-report-analysis") {
    return <AutomatedReportAnalysisPanel onBack={() => setStep("hub")} />;
  }

  if (step === "custom-alerts") {
    return <CustomAlertsPanel onBack={() => setStep("hub")} />;
  }

  if (step === "stock-scanner") {
    return <StockScannerPanel onBack={() => setStep("hub")} />;
  }

  if (step === "options-calculator") {
    return <OptionsCalculatorPanel onBack={() => setStep("hub")} />;
  }

  if (step === "correlation-checker") {
    return <CorrelationCheckerPanel onBack={() => setStep("hub")} />;
  }

  if (step === "brief-type") {
    return (
      <BriefTypeStep
        onBack={() => setStep("hub")}
        onSelect={(type) => setStep(type === "daily" ? "daily-brief" : "weekly-brief")}
      />
    );
  }

  if (step === "daily-brief") {
    return <DailyBrief onBack={() => setStep("brief-type")} />;
  }

  return <WeeklyBrief onBack={() => setStep("brief-type")} />;
}
