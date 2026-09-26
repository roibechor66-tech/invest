// Mock risk assumptions for the "investing" risk-management panel:
// per-holding beta (systematic risk vs. the broad market) used to derive
// a weighted portfolio beta, estimated volatility and a simplified
// parametric VaR. These are illustrative placeholder betas for Phase
// 1/2 — Phase 3 will pull real, regularly-updated beta figures from a
// market-data provider instead of this fixed table.
export const mockBetaByTicker: Record<string, number> = {
  NVDA: 1.75,
  MSFT: 0.92,
  TSM: 1.15,
  VRT: 1.55,
  "TEVA.TA": 0.55,
  "POLI.TA": 0.75,
};

// Assumed long-run annual volatility of the broad market (S&P 500-like),
// used as the baseline that portfolio beta scales to estimate the
// portfolio's own volatility. A simplifying, clearly-labeled assumption
// rather than a live-calculated figure.
export const ASSUMED_MARKET_ANNUAL_VOL_PCT = 16;

// z-score for a one-tailed 95% confidence interval, used for the
// simplified parametric (variance-covariance) VaR estimate.
export const Z_SCORE_95 = 1.645;

// Trading days per year, for converting annual volatility to daily.
export const TRADING_DAYS_PER_YEAR = 252;

// Per-holding annualized volatility assumptions, used together with the
// correlation matrix below to build the portfolio's own covariance
// matrix for the Sharpe-ratio calculation — a more realistic estimate
// of portfolio risk than scaling a single market-wide volatility by
// beta alone, since it also captures how much the holdings move
// together. Illustrative Phase 1/2 mock figures; Phase 3 will compute
// these from real historical daily returns.
export const mockVolatilityByTicker: Record<string, number> = {
  NVDA: 45,
  MSFT: 22,
  TSM: 30,
  VRT: 40,
  "TEVA.TA": 28,
  "POLI.TA": 20,
};

// Pairwise correlation matrix between the portfolio's holdings (symmetric,
// 1 on the diagonal). Illustrative Phase 1/2 mock — a real semiconductor
// pair like NVDA/TSM is set clearly higher than an unrelated pair like
// NVDA/POLI.TA, and the two Israeli holdings (TEVA.TA/POLI.TA) carry
// some shared local-market correlation. Phase 3 will compute this from
// real historical daily returns instead.
export const mockCorrelationMatrix: Record<string, Record<string, number>> = {
  NVDA: { NVDA: 1, MSFT: 0.55, TSM: 0.75, VRT: 0.65, "TEVA.TA": 0.1, "POLI.TA": 0.05 },
  MSFT: { NVDA: 0.55, MSFT: 1, TSM: 0.5, VRT: 0.45, "TEVA.TA": 0.15, "POLI.TA": 0.1 },
  TSM: { NVDA: 0.75, MSFT: 0.5, TSM: 1, VRT: 0.4, "TEVA.TA": 0.1, "POLI.TA": 0.05 },
  VRT: { NVDA: 0.65, MSFT: 0.45, TSM: 0.4, VRT: 1, "TEVA.TA": 0.05, "POLI.TA": 0.05 },
  "TEVA.TA": { NVDA: 0.1, MSFT: 0.15, TSM: 0.1, VRT: 0.05, "TEVA.TA": 1, "POLI.TA": 0.35 },
  "POLI.TA": { NVDA: 0.05, MSFT: 0.1, TSM: 0.05, VRT: 0.05, "TEVA.TA": 0.35, "POLI.TA": 1 },
};

// Assumed annual risk-free rate (roughly a 10-year Treasury yield), used
// as the Sharpe ratio's baseline for "return per unit of risk above a
// risk-free investment".
export const RISK_FREE_RATE_PCT = 4.5;
