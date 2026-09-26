"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface DisclaimerGateProps {
  onConfirm: (dontShowAgain: boolean) => void;
}

// Shown the first time a visitor enters the site (dashboard/page.tsx
// checks localStorage/sessionStorage before rendering this): a legal
// disclaimer — nothing here is investment advice, and the platform's
// figures are still mock data in Phase 1/2. This cannot be dismissed
// silently — the user must explicitly click the confirmation button.
// The "אל תציג שוב" checkbox (checked by default) controls whether the
// acknowledgement is remembered permanently (localStorage) or only for
// this browser session (sessionStorage), so an unchecked box means the
// disclaimer comes back next visit. This is deliberately separate from
// the one-time post-signup portfolio-building nudge (PortfolioNudgeModal),
// which has its own independent trigger.
export function DisclaimerGate({ onConfirm }: DisclaimerGateProps) {
  const [dontShowAgain, setDontShowAgain] = useState(true);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
            <AlertTriangle size={20} />
          </span>
          <h3 className="text-lg font-bold text-slate-900">כתב ויתור והבהרה משפטית</h3>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-500">
          התוכן, הכלים והנתונים באפליקציה זו — לרבות מחשבוני סיכון, הערכות
          שווי, תזות, חדשות ובריפים — מוצגים למטרות מידע והדגמה בלבד, ואינם
          מהווים ייעוץ השקעות, המלצה לביצוע עסקה, או תחליף לייעוץ מקצועי
          מותאם אישית. חלק מהנתונים המוצגים כרגע הם נתוני דמה (Mock) לצורך
          בניית הממשק וטרם חוברו למקורות מידע חיים. כל החלטת השקעה היא
          באחריותכם הבלעדית, ומומלץ להיוועץ ביועץ/ת השקעות מוסמך/ת לפני
          קבלת החלטות פיננסיות.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border bg-surface-raised accent-brand-500"
          />
          אל תציג שוב
        </label>

        <button
          type="button"
          onClick={() => onConfirm(dontShowAgain)}
          className="mt-5 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          קראתי ואני מאשר/ת
        </button>
      </div>
    </div>
  );
}
