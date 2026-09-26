import { PortfolioSummaryData } from "@/lib/types";

// Mock portfolio data for Phase 1 UI scaffolding.
// This will be replaced by a live call to the FastAPI backend in Phase 2/3.
export const mockPortfolioSummary: PortfolioSummaryData = {
  totalValueUsd: 284_650,
  dayChangePct: 1.24,
  dayChangeUsd: 3_487,
  cashPct: 8.5,
  holdings: [
    {
      ticker: "NVDA",
      nameHe: "אנבידיה",
      quantity: 120,
      avgCost: 92.3,
      lastPrice: 178.4,
      weightPct: 22.1,
      dayChangePct: 2.1,
    },
    {
      ticker: "MSFT",
      nameHe: "מיקרוסופט",
      quantity: 60,
      avgCost: 310.1,
      lastPrice: 428.9,
      weightPct: 17.8,
      dayChangePct: 0.6,
    },
    {
      ticker: "TSM",
      nameHe: "טאיוואן סמיקונדקטור",
      quantity: 150,
      avgCost: 95.0,
      lastPrice: 172.2,
      weightPct: 15.4,
      dayChangePct: -0.8,
    },
    {
      ticker: "VRT",
      nameHe: "וורטיב הולדינגס",
      quantity: 300,
      avgCost: 45.6,
      lastPrice: 98.7,
      weightPct: 9.6,
      dayChangePct: 3.4,
    },
    {
      ticker: "TEVA.TA",
      nameHe: "טבע",
      quantity: 800,
      avgCost: 38.2,
      lastPrice: 51.6,
      weightPct: 6.2,
      dayChangePct: -0.3,
    },
    {
      ticker: "POLI.TA",
      nameHe: "בנק הפועלים",
      quantity: 400,
      avgCost: 29.4,
      lastPrice: 41.8,
      weightPct: 4.9,
      dayChangePct: 0.5,
    },
  ],
};
