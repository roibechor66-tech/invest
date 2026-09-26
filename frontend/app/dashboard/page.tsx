"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PortfolioSummaryCard } from "@/components/dashboard/PortfolioSummaryCard";
import { PortfolioPerformanceSection } from "@/components/dashboard/PortfolioPerformanceSection";
import { WatchedIndicesCard } from "@/components/dashboard/WatchedIndicesCard";
import { StockSearchBar } from "@/components/dashboard/StockSearchBar";
import { SectionGrid } from "@/components/dashboard/SectionGrid";
import { ActionResultModal } from "@/components/dashboard/ActionResultModal";
import { DisclaimerGate } from "@/components/dashboard/DisclaimerGate";
import { PortfolioNudgeModal } from "@/components/dashboard/PortfolioNudgeModal";
import { dashboardSections } from "@/lib/mock-data/sections";
import { mockIndices, indexPeriodOptions, indexCategoryOptions } from "@/lib/mock-data/indices";
import { ActionButtonConfig } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { PortfolioProvider } from "@/lib/portfolio-context";

// Main dashboard page. Gated behind login (Phase 2): a visitor without a
// session is redirected to /login. Portfolio figures are still mock data;
// the risk-management and valuation buttons now open real calculators
// wired to the FastAPI backend, everything else stays a Phase 3 placeholder.
export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [activeButton, setActiveButton] = useState<ActionButtonConfig | null>(
    null
  );
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showPortfolioNudge, setShowPortfolioNudge] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  // Two independent, separately-tracked prompts, after login resolves so
  // neither flashes before the redirect check:
  //  - the legal disclaimer gates every entry to the site until it's
  //    been explicitly acknowledged at least once (or forever, if "אל
  //    תציג שוב" was checked);
  //  - the portfolio-building nudge only ever shows once, right after a
  //    brand-new signup (see auth-context's register()), never again.
  // If both would fire together (a fresh signup), the disclaimer takes
  // priority — the nudge follows right after it's acknowledged.
  useEffect(() => {
    if (!isLoading && user) {
      const disclaimerAcked =
        window.localStorage.getItem("disclaimer_ack") ||
        window.sessionStorage.getItem("disclaimer_ack_session");
      if (!disclaimerAcked) {
        setShowDisclaimer(true);
      } else {
        maybeShowPortfolioNudge();
      }
    }
  }, [isLoading, user]);

  function maybeShowPortfolioNudge() {
    if (window.localStorage.getItem("just_registered")) {
      window.localStorage.removeItem("just_registered");
      setShowPortfolioNudge(true);
    }
  }

  function acknowledgeDisclaimer(dontShowAgain: boolean) {
    if (dontShowAgain) {
      window.localStorage.setItem("disclaimer_ack", "1");
    } else {
      window.sessionStorage.setItem("disclaimer_ack_session", "1");
    }
    setShowDisclaimer(false);
    maybeShowPortfolioNudge();
  }

  const allButtons = dashboardSections.flatMap((section) => section.buttons);

  function handleTrigger(id: ActionButtonConfig["id"]) {
    const button = allButtons.find((b) => b.id === id) ?? null;
    setActiveButton(button);
  }

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface">
        <p className="text-sm text-slate-500">טוען...</p>
      </main>
    );
  }

  return (
    // The provider wraps everything that can show or edit "the real
    // portfolio" — the summary card below and the Portfolio Builder's
    // "התיק שלי" tab (opened from ActionResultModal) — so an edit made
    // in one place is visible in the other immediately.
    <PortfolioProvider>
      <main className="min-h-screen bg-surface">
        <DashboardHeader />

        <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
          <StockSearchBar />
          <PortfolioSummaryCard />
          <WatchedIndicesCard
            indices={mockIndices}
            periods={indexPeriodOptions}
            categories={indexCategoryOptions}
          />
          <PortfolioPerformanceSection />

          {dashboardSections.map((section) => (
            <SectionGrid key={section.id} section={section} onTrigger={handleTrigger} />
          ))}
        </div>

        {activeButton && (
          <ActionResultModal button={activeButton} onClose={() => setActiveButton(null)} />
        )}

        {showDisclaimer && <DisclaimerGate onConfirm={acknowledgeDisclaimer} />}

        {showPortfolioNudge && (
          <PortfolioNudgeModal
            onBuildPortfolio={() => {
              setShowPortfolioNudge(false);
              handleTrigger("portfolio-builder");
            }}
            onSkip={() => setShowPortfolioNudge(false)}
          />
        )}
      </main>
    </PortfolioProvider>
  );
}
