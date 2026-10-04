"use client";

import { MarketBrief } from "@/components/dashboard/tools/bot/MarketBrief";

// Daily brief: what happened in the last trading session and what's
// expected today, per market — real, web-search-backed (see MarketBrief).
export function DailyBrief({ onBack }: { onBack: () => void }) {
  return <MarketBrief kind="daily" onBack={onBack} />;
}
