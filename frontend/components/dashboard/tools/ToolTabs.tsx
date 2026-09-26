interface Tab {
  id: string;
  labelHe: string;
}

interface ToolTabsProps {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
}

// Small pill-style tab switcher shared by the risk and valuation panels.
export function ToolTabs({ tabs, activeId, onChange }: ToolTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-surface-border pb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            activeId === tab.id
              ? "bg-brand-500 text-white"
              : "bg-surface-raised text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.labelHe}
        </button>
      ))}
    </div>
  );
}
