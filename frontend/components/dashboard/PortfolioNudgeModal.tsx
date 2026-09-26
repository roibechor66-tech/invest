"use client";

import { Wallet } from "lucide-react";

interface PortfolioNudgeModalProps {
  onBuildPortfolio: () => void;
  onSkip: () => void;
}

// Shown exactly once, the first time a user lands on the dashboard right
// after signing up (dashboard/page.tsx gates this on a `just_registered`
// flag set by the register() call, not on the legal disclaimer's own
// flag — the two are independent nudges with independent triggers): a
// nudge to build their real investment portfolio, since every tool on
// the dashboard (risk management, valuation, performance vs. benchmark)
// is only as useful as the holdings it's calculated against. The user
// can skip and come back to portfolio setup later from the dashboard
// itself at any time.
export function PortfolioNudgeModal({ onBuildPortfolio, onSkip }: PortfolioNudgeModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
            <Wallet size={20} />
          </span>
          <h3 className="text-lg font-bold text-slate-900">ברוכים הבאים! נבנה את תיק ההשקעות שלכם?</h3>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          כדי שהכלים באפליקציה — ניהול סיכונים, בדיקות תרחיש, הערכות שווי
          ומעקב ביצועים — יתאימו את עצמם באמת למצבכם, מומלץ להזין את תיק
          ההשקעות האמיתי שלכם. אפשר גם לדלג על השלב הזה עכשיו ולחזור אליו
          בכל שלב מאוחר יותר מתוך הדשבורד.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onBuildPortfolio}
            className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            בניית תיק ההשקעות שלי
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 rounded-lg border border-surface-border py-2.5 text-sm font-semibold text-slate-700 hover:bg-surface-raised"
          >
            דלג לעת עתה
          </button>
        </div>
      </div>
    </div>
  );
}
