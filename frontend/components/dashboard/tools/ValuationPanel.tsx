"use client";

import { useState } from "react";
import { ModelSelectStep } from "@/components/dashboard/tools/valuation/ModelSelectStep";
import { CompanyAndModeStep } from "@/components/dashboard/tools/valuation/CompanyAndModeStep";
import { DcfWorkspace } from "@/components/dashboard/tools/valuation/DcfWorkspace";
import { GrowthExitWorkspace } from "@/components/dashboard/tools/valuation/GrowthExitWorkspace";
import { TradingMultiplesWorkspace } from "@/components/dashboard/tools/valuation/TradingMultiplesWorkspace";
import { ForwardMultipleWorkspace } from "@/components/dashboard/tools/valuation/ForwardMultipleWorkspace";
import { SotpWorkspace } from "@/components/dashboard/tools/valuation/SotpWorkspace";
import { ValuationModelId } from "@/lib/mock-data/valuation-models";

type WizardStep = "model" | "company" | "workspace";

// Guided valuation flow: pick a model (with an explanation of what it is,
// what it takes, and which companies it fits) -> search for and pick a
// company (or skip to a fully manual build) -> choose whether Claude
// runs the model with assumptions derived from the company's data
// (each with a short rationale) or the user sets every assumption
// themselves -> an editable workspace with live results. Replaces the
// old flat tab switcher between the five standalone calculators.
export function ValuationPanel() {
  const [step, setStep] = useState<WizardStep>("model");
  const [modelId, setModelId] = useState<ValuationModelId | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "manual">("manual");

  function handleSelectModel(id: ValuationModelId) {
    setModelId(id);
    setStep("company");
  }

  function handleProceed(pickedTicker: string | null, pickedMode: "auto" | "manual") {
    setTicker(pickedTicker);
    setMode(pickedMode);
    setStep("workspace");
  }

  function backToModel() {
    setStep("model");
    setModelId(null);
  }

  function backToCompany() {
    setStep("company");
  }

  if (step === "model" || !modelId) {
    return <ModelSelectStep onSelect={handleSelectModel} />;
  }

  if (step === "company") {
    return <CompanyAndModeStep modelId={modelId} onBack={backToModel} onProceed={handleProceed} />;
  }

  switch (modelId) {
    case "dcf":
      return <DcfWorkspace ticker={ticker} mode={mode} onBack={backToCompany} />;
    case "growth-exit":
      return <GrowthExitWorkspace ticker={ticker} mode={mode} onBack={backToCompany} />;
    case "trading-multiples":
      return <TradingMultiplesWorkspace ticker={ticker} mode={mode} onBack={backToCompany} />;
    case "forward-multiple":
      return <ForwardMultipleWorkspace ticker={ticker} mode={mode} onBack={backToCompany} />;
    case "sotp":
      return <SotpWorkspace ticker={ticker} mode={mode} onBack={backToCompany} />;
    default:
      return null;
  }
}
