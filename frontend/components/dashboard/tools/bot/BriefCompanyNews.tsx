import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { BotMarketId, MARKET_PORTFOLIO_TICKERS } from "@/lib/mock-data/bot-briefs";

interface BriefCompanyNewsProps {
  market: BotMarketId;
}

// If a held company has a notable event or news item, it belongs at the
// bottom of the brief — separate from the market-wide summary above, and
// scoped to whichever holdings are actually relevant to this market
// (e.g. only the Israeli holdings show up under the Israeli-market
// brief). Reuses the same per-stock news feed the stock detail modal
// shows, so there's a single source of truth for "what's the latest on
// this holding".
export function BriefCompanyNews({ market }: BriefCompanyNewsProps) {
  const tickers = MARKET_PORTFOLIO_TICKERS[market];
  const items = tickers
    .map((ticker) => {
      const detail = mockStockDetails[ticker];
      const latest = detail?.news[0];
      return latest ? { ticker, nameHe: detail.nameHe, ...latest } : null;
    })
    .filter((item): item is NonNullable<typeof item> => !!item);

  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        חדשות ואירועים ממניות התיק שלכם
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <a
            key={item.ticker}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-surface-border bg-surface-raised p-2.5 no-underline"
          >
            <p className="text-[11px] font-semibold text-brand-400">
              {item.ticker} · {item.nameHe}
            </p>
            <p className="mt-1 text-sm text-slate-800">{item.titleHe}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {item.source} · {item.dateHe}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
