"use client";

import { X } from "lucide-react";
import { ActionButtonConfig } from "@/lib/types";
import { RiskManagementPanel } from "@/components/dashboard/tools/RiskManagementPanel";
import { ValuationPanel } from "@/components/dashboard/tools/ValuationPanel";
import { PortfolioBuilderPanel } from "@/components/dashboard/tools/PortfolioBuilderPanel";
import { BotPanel } from "@/components/dashboard/tools/BotPanel";
import { FinancialReportAnalysisPanel } from "@/components/dashboard/tools/FinancialReportAnalysisPanel";
import { EquityThesisPanel } from "@/components/dashboard/tools/EquityThesisPanel";
import { WeeklySummaryPanel } from "@/components/dashboard/tools/WeeklySummaryPanel";

interface ActionResultModalProps {
  button: ActionButtonConfig;
  onClose: () => void;
}

// Modal shown when a dashboard button is clicked. Phase 2 tools (risk
// management, custom valuation, the portfolio builder) render their real
// interactive tools here; everything else still shows the Phase 1/3
// placeholder until its backend integration is built.
export function ActionResultModal({ button, onClose }: ActionResultModalProps) {
  const isRiskManagement = button.id === "risk-management";
  const isValuation = button.id === "custom-valuation";
  const isPortfolioBuilder = button.id === "portfolio-builder";
  const isBot = button.id === "ai-bot";
  const isReportAnalysis = button.id === "financial-report-analysis";
  const isThesisBuilder = button.id === "thesis-builder";
  const isWeeklySummary = button.id === "weekly-summary";
  const hasRealTool =
    isRiskManagement || isValuation || isPortfolioBuilder || isBot || isReportAnalysis || isThesisBuilder || isWeeklySummary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={
          // Every modal variant gets max-h-[90vh] + overflow-y-auto so long
          // content (e.g. RiskManagementPanel's Sharpe-ratio section) can
          // never push the header/close button off-screen with no way to
          // scroll back to it — only the max-width differs by tool. Bug:
          // the risk-management branch used to fall into a width-only
          // class with neither, so a tall panel there had no scrollbar and
          // no visible way to close the modal.
          isPortfolioBuilder || isValuation || isBot || isReportAnalysis || isThesisBuilder || isWeeklySummary
            ? "w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl"
            : hasRealTool
              ? "w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl"
              : "w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl"
        }
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-900">{button.labelHe}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-700"
            aria-label="סגור"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          {isRiskManagement && <RiskManagementPanel />}
          {isValuation && <ValuationPanel />}
          {isPortfolioBuilder && <PortfolioBuilderPanel />}
          {isBot && <BotPanel />}
          {isReportAnalysis && <FinancialReportAnalysisPanel />}
          {isThesisBuilder && <EquityThesisPanel />}
          {isWeeklySummary && <WeeklySummaryPanel />}
          {!hasRealTool && (
            <p className="text-sm leading-relaxed text-slate-500">
              זהו שלב 1/3 טרם הושלם עבור כפתור זה — הלוגיקה האמיתית (חיבור
              ל-API, מנוע ה-AI או בריפים חיים) תתווסף בהמשך הפרויקט.
            </p>
          )}
        </div>

        {!hasRealTool && (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            הבנתי
          </button>
        )}
      </div>
    </div>
  );
}
