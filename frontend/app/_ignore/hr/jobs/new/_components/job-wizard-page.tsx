"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { useJobWizardStore } from "../_lib/job-wizard-store";
import { hashStep1 } from "../_lib/wizard-utils";
import type { Step1JobForm } from "../_lib/wizard-types";
import { StepDtoForm } from "./step-dto-form";
import { StepAiSuggestions } from "./step-ai-suggestions";
import { StepEscrow } from "./step-escrow";
import { StepReviewPublish } from "./step-review-publish";
import { useRouter } from "next/navigation";

const STEP_LABELS = [
  "Details",
  "AI review",
  "Escrow",
  "Review",
] as const;

export function JobWizardPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const step = useJobWizardStore((s) => s.step);
  const step1 = useJobWizardStore((s) => s.step1);
  const setStep1 = useJobWizardStore((s) => s.setStep1);
  const setStep = useJobWizardStore((s) => s.setStep);

  React.useEffect(() => {
    if (step > 1 && !step1) setStep(1);
  }, [step, step1, setStep]);

  async function handleStep1Next(data: Step1JobForm) {
    const st = useJobWizardStore.getState();
    const h = hashStep1(data);
    if (st.draftJobId && st.step1AiHash && h !== st.step1AiHash) {
      useJobWizardStore.setState({
        draftJobId: null,
        step1AiHash: null,
        parseResult: null,
        aiChoice: null,
        finalDescription: null,
        lastPostedDescription: null,
        lastPostedBonus: null,
        escrowFunded: false,
        escrowTxSignature: "",
        escrowInitData: null,
      });
    }
    setStep1(data);
    setStep(2);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Create job posting
            </h1>
            <p className="text-muted-foreground">
              Four steps, details, mandatory AI verification, optional escrow,
              then publish.
            </p>
          </div>
        </div>

        {!token ? (
          <p className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            Sign in as an employer so requests include your session (
            <code className="rounded bg-muted px-1">Authorization</code> or auth
            cookie).
          </p>
        ) : null}

        <nav
          className="mb-10 flex flex-wrap gap-2 border-b pb-4"
          aria-label="Job creation steps"
        >
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4;
            const active = step === n;
            const done = step > n;
            return (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                  active
                    ? "border-primary bg-primary/10 font-medium"
                    : done
                      ? "border-muted-foreground/30 text-muted-foreground"
                      : "border-transparent text-muted-foreground"
                }`}
              >
                <span className="tabular-nums">{i + 1}</span>
                {label}
              </div>
            );
          })}
        </nav>

        {step === 1 ? (
          <StepDtoForm
            key={step1 ? hashStep1(step1) : "new"}
            initial={step1 ?? undefined}
            onNext={handleStep1Next}
          />
        ) : null}

        {step === 2 && step1 ? (
          <StepAiSuggestions
            step1={step1}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        ) : null}

        {step === 3 && step1 ? (
          <StepEscrow
            step1={step1}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        ) : null}

        {step === 4 && step1 ? (
          <StepReviewPublish
            step1={step1}
            onBack={() => setStep(3)}
          />
        ) : null}
      </div>
    </div>
  );
}
