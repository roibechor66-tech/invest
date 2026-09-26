import { TRUSTED_SOURCES } from "@/lib/mock-data/bot-briefs";

interface BriefSourceTagProps {
  sourceHandle: string;
}

// Small attribution chip shown next to every headline the bot brings
// into a brief, so it's always clear which of the bot's curated,
// reliable sources a line came from — the bot never cites anything
// outside that short list.
export function BriefSourceTag({ sourceHandle }: BriefSourceTagProps) {
  const source = TRUSTED_SOURCES.find((s) => s.handle === sourceHandle);
  if (!source) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-slate-500">
      {source.kind === "twitter" ? "𝕏" : "🌐"} {source.nameHe}
    </span>
  );
}
