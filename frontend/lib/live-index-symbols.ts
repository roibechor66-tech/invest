// Maps a subset of mockIndices' `id`s (lib/mock-data/indices.ts) to a real,
// Finnhub-quotable ticker symbol, for the watched-indices card
// (WatchedIndicesCard.tsx) to show a live current level + live daily %
// change on top of the otherwise-mock weekly/quarterly/YTD/yearly/5y
// returns and P/E ratios.
//
// Deliberately NOT exhaustive — only ids that map to an actual, literal
// tradable ticker are included here. Left out on purpose, and staying
// mock-only:
//   - Israeli indices (ta35/ta125/ta-tech) and most non-US country
//     indices quoted as an index level (DAX/CAC40/FTSE100/
//     Euro Stoxx 50/IBEX35, Nikkei 225/KOSPI/Hang Seng) — there IS a
//     "closest" US-listed ETF for several of these (e.g. EWG for
//     Germany), but that ETF tracks a different underlying index
//     (MSCI Germany, not the DAX itself) with a different level and
//     return, so substituting it would show a live number that quietly
//     doesn't match the label. Not worth the confusion for this screen.
//   - VIX — no single reliable spot-tracking ETF ticker (VIXY/UVXY track
//     VIX *futures*, which diverge from the spot VIX level shown here).
//   - Bond yields and commodities — Finnhub's free tier doesn't reliably
//     cover government-bond yields or commodity spot prices; left as mock
//     rather than guessing at an untested endpoint.
//
// Every id below IS the literal ETF itself (not a proxy for something
// else), so the live price/return shown is exactly what the label says.
export const LIVE_INDEX_SYMBOLS: Record<string, string> = {
  // US broad market, via the standard liquid ETF proxy (same ones used
  // for portfolio benchmarks in the backend)
  sp500: "SPY",
  nasdaq100: "QQQ",

  // Sector & thematic ETFs — the id already *is* the real ticker
  xlk: "XLK",
  xlf: "XLF",
  xlv: "XLV",
  xle: "XLE",
  xli: "XLI",
  xly: "XLY",
  xlp: "XLP",
  xlu: "XLU",
  xlb: "XLB",
  xlre: "XLRE",
  xlc: "XLC",
  igv: "IGV",
  cibr: "CIBR",
  soxx: "SOXX",
  aiq: "AIQ",
  dram: "DRAM",

  // Asia — country ETFs (id is the real ticker); Nikkei/KOSPI/Hang Seng
  // (index levels, no matching single-country US-listed ETF) stay mock
  inda: "INDA",
  eem: "EEM",
  fxi: "FXI",
  ewt: "EWT",
  vnm: "VNM",

  // South America — all six are real, single-country ETF tickers
  ewz: "EWZ",
  ech: "ECH",
  argt: "ARGT",
  gxg: "GXG",
  epu: "EPU",
  ilf: "ILF",
};
