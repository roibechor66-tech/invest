interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  placeholder?: string;
}

// Small shared numeric input used across every calculator form.
export function FormField({ label, value, onChange, step = "any", placeholder }: FormFieldProps) {
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
    </div>
  );
}
