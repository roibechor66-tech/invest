import clsx from "clsx";
import { ActionButtonConfig, DashboardSection } from "@/lib/types";
import { ActionButtonCard } from "@/components/dashboard/ActionButtonCard";

interface SectionGridProps {
  section: DashboardSection;
  onTrigger: (id: ActionButtonConfig["id"]) => void;
}

// Renders one dashboard module as a responsive grid of action button
// cards. "large" sections (core tools) use fewer, bigger columns;
// "compact" sections (bot briefs) pack more, smaller cards per row.
export function SectionGrid({ section, onTrigger }: SectionGridProps) {
  const isLarge = section.buttonSize === "large";

  return (
    <section className="space-y-4">
      <div>
        <h2
          className={clsx(
            "font-bold text-slate-900",
            isLarge ? "text-xl" : "text-sm uppercase tracking-wide text-slate-500"
          )}
        >
          {section.titleHe}
        </h2>
        <p className={clsx("text-slate-500", isLarge ? "text-sm" : "text-xs")}>
          {section.subtitleHe}
        </p>
      </div>
      <div
        className={clsx(
          "grid grid-cols-2 gap-3",
          isLarge ? "sm:grid-cols-2 lg:grid-cols-3 gap-4" : "sm:grid-cols-3 lg:grid-cols-6"
        )}
      >
        {section.buttons.map((button) => (
          <ActionButtonCard
            key={button.id}
            config={button}
            size={section.buttonSize}
            onTrigger={onTrigger}
          />
        ))}
      </div>
    </section>
  );
}
