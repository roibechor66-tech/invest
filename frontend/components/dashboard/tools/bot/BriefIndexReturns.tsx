import { mockIndices } from "@/lib/mock-data/indices";
import { IndexPeriodId } from "@/lib/types";

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

interface BriefIndexReturnsProps {
  period: IndexPeriodId;
  indexIds: string[];
  titleHe: string;
}

// The section every brief carries regardless of type or market: how that
// market's major indices actually moved. Pulled from the same mock index
// data the watchlist card uses, so it never drifts out of sync with the
// rest of the dashboard. Which indices count as "major" for a market is
// decided by the caller (see MARKET_INDEX_IDS in bot-briefs.ts).
export function BriefIndexReturns({ period, indexIds, titleHe }: BriefIndexReturnsProps) {
  const rows = indexIds
    .map((id) => mockIndices.find((i) => i.id === id))
    .filter((i): i is NonNullable<typeof i> => !!i);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{titleHe}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((row) => {
          const value = row.returns[period];
          return (
            <div key={row.id} className="rounded-lg border border-surface-border bg-surface-raised p-2.5 text-center">
              <p className="text-[11px] text-slate-500">{row.labelHe}</p>
              <p className={`mt-1 text-sm font-bold ${value >= 0 ? "text-positive" : "text-negative"}`}>
                {formatPct(value)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
