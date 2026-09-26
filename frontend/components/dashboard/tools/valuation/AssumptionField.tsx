interface AssumptionFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rationaleHe?: string;
  placeholder?: string;
  step?: string;
}

// A single editable assumption in the valuation workspace: a numeric
// field plus, when the value was auto-filled from the company's mock
// data, a short line explaining *why* that starting number was chosen.
// Editing the field doesn't clear the rationale — it's there to explain
// the starting point, not to force the user to keep it.
export function AssumptionField({
  label,
  value,
  onChange,
  rationaleHe,
  placeholder,
  step = "any",
}: AssumptionFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
      />
      {rationaleHe && (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{rationaleHe}</p>
      )}
    </div>
  );
}
