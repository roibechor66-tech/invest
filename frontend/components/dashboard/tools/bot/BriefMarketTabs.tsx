import { BOT_MARKETS, BotMarketId } from "@/lib/mock-data/bot-briefs";

interface BriefMarketTabsProps {
  activeMarket: BotMarketId;
  onChange: (market: BotMarketId) => void;
}

// Lets the person switch which market a brief covers (their portfolio,
// Israel, the US, or Asia) without leaving the brief or picking the
// daily/weekly type again.
export function BriefMarketTabs({ activeMarket, onChange }: BriefMarketTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-surface-border pb-3">
      {BOT_MARKETS.map((market) => {
        const active = market.id === activeMarket;
        return (
          <button
            key={market.id}
            type="button"
            onClick={() => onChange(market.id)}
            className={
              active
                ? "rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white"
                : "rounded-full bg-surface-raised px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
            }
          >
            {market.labelHe}
          </button>
        );
      })}
    </div>
  );
}
