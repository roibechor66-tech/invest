import { TrendingUp, Rocket, BarChart3, Target, Layers, ChevronLeft } from "lucide-react";
import { VALUATION_MODELS, ValuationModelId } from "@/lib/mock-data/valuation-models";

const ICONS = { TrendingUp, Rocket, BarChart3, Target, Layers };

interface ModelSelectStepProps {
  onSelect: (id: ValuationModelId) => void;
}

// Step 1 of the guided valuation flow: one card per model, each
// explaining what it is, what building it involves, and which kind of
// company it fits best — so the user picks a model on purpose rather
// than guessing from a bare name.
export function ModelSelectStep({ onSelect }: ModelSelectStepProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        בחרו מודל הערכת שווי. לכל מודל הסבר על מהו, מה תצטרכו לקבוע, ולאילו
        חברות הוא הכי מתאים.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {VALUATION_MODELS.map((model) => {
          const Icon = ICONS[model.icon];
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => onSelect(model.id)}
              className="flex flex-col gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-start transition hover:border-brand-500/50 hover:bg-surface-raised/70"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Icon size={16} className="text-brand-400" />
                  {model.nameHe}
                </span>
                <ChevronLeft size={16} className="text-slate-600" />
              </div>
              <p className="text-xs leading-relaxed text-slate-500">{model.whatItIsHe}</p>
              <p className="mt-auto text-[11px] leading-relaxed text-brand-400/90">
                <span className="font-semibold">מתאים במיוחד ל: </span>
                {model.bestForHe}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
