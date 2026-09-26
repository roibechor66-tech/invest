"use client";

import * as Icons from "lucide-react";
import clsx from "clsx";
import { ActionButtonConfig, ButtonSize } from "@/lib/types";

interface ActionButtonCardProps {
  config: ActionButtonConfig;
  size: ButtonSize;
  onTrigger: (id: ActionButtonConfig["id"]) => void;
}

// A single clickable action card representing one tool or brief.
// "large" is used for the core portfolio/risk/research tools; "compact"
// is used for the automated bot's brief buttons, which are numerous and
// meant to read as a dense, secondary strip rather than headline actions.
export function ActionButtonCard({ config, size, onTrigger }: ActionButtonCardProps) {
  const IconComponent =
    (Icons as unknown as Record<string, Icons.LucideIcon>)[config.icon] ??
    Icons.CircleDot;

  const isLarge = size === "large";

  return (
    <button
      type="button"
      onClick={() => onTrigger(config.id)}
      className={clsx(
        "group flex h-full flex-col items-start rounded-xl border border-surface-border bg-surface-card text-right shadow-sm transition hover:-translate-y-0.5 hover:border-brand-500/60 hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        isLarge ? "gap-3 p-5" : "gap-2 p-3"
      )}
    >
      <span
        className={clsx(
          "flex items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 group-hover:bg-brand-500/20",
          isLarge ? "h-11 w-11" : "h-8 w-8"
        )}
      >
        <IconComponent size={isLarge ? 22 : 15} />
      </span>
      <span
        className={clsx(
          "font-semibold text-slate-900",
          isLarge ? "text-lg" : "text-sm"
        )}
      >
        {config.labelHe}
      </span>
      {isLarge && (
        <span className="text-sm leading-relaxed text-slate-500">
          {config.descriptionHe}
        </span>
      )}
    </button>
  );
}
