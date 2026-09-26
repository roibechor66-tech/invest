interface ResultRowProps {
  label: string;
  value: string;
  emphasize?: boolean;
}

// One line of a calculator's result panel: label on the right, value on
// the left, with an emphasized style for the headline number.
export function ResultRow({ label, value, emphasize }: ResultRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={
          emphasize
            ? "text-base font-extrabold text-brand-400"
            : "text-sm font-semibold text-slate-800"
        }
      >
        {value}
      </span>
    </div>
  );
}
