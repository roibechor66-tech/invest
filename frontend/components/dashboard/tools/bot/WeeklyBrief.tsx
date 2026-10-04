"use client";

import { MarketBrief } from "@/components/dashboard/tools/bot/MarketBrief";

// Weekly brief: what's coming this week and what to watch, per market —
// real, web-search-backed (see MarketBrief).
export function WeeklyBrief({ onBack }: { onBack: () => void }) {
  return <MarketBrief kind="weekly" onBack={onBack} />;
}
