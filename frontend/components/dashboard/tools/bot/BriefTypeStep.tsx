import { ArrowRight, CalendarDays, CalendarRange } from "lucide-react";

interface BriefTypeStepProps {
  onBack: () => void;
  onSelect: (type: "daily" | "weekly") => void;
}

// Choosing between the two brief formats: daily looks back at yesterday
// and ahead to today; weekly looks ahead across the coming week's
// calendar, macro backdrop and sector leadership.
export function BriefTypeStep({ onBack, onSelect }: BriefTypeStepProps) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowRight size={14} /> חזרה לבוט
      </button>

      <p className="text-sm font-bold text-slate-900">בריפים — איזה סוג?</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect("daily")}
          className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
            <CalendarDays size={20} />
          </span>
          <span className="text-base font-bold text-slate-900">בריף יומי</span>
          <span className="text-sm text-slate-500">
            מה קרה אתמול, מה צפוי היום, תשואות המדדים המרכזיים והתיק שלכם
            מול S&amp;P 500.
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSelect("weekly")}
          className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-right transition hover:border-brand-500/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
            <CalendarRange size={20} />
          </span>
          <span className="text-base font-bold text-slate-900">בריף שבועי</span>
          <span className="text-sm text-slate-500">
            אירועים כלכליים ומגמות מאקרו לשבוע הקרוב, הסקטורים הבולטים
            לחיוב, ותשואת התיק השבועית מול S&amp;P 500.
          </span>
        </button>
      </div>
    </div>
  );
}
