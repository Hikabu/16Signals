"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useJobWizardStore } from "../_lib/job-wizard-store";
import {
  buildAiDescriptionPreview,
  buildAiMergedDescription,
  buildAiRequirementsPreview,
  buildCreateJobPayload,
  buildMarkdownDescription,
  formatApiError,
  hashStep1,
  salaryMarketNote,
} from "../_lib/wizard-utils";
import { replaceDraftJob } from "../_lib/wizard-draft";
import type { Step1JobForm } from "../_lib/wizard-types";
import type { AiChoice } from "../_lib/wizard-types";

export function StepAiSuggestions(props: {
  step1: Step1JobForm;
  onBack: () => void;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const {
    parseResult,
    setAfterAiRun,
    setDraftMeta,
    setAiChoice,
  } = useJobWizardStore();

  const runAi = useMutation({
    mutationFn: async () => {
      const { draftJobId } = useJobWizardStore.getState();
      const desc = buildMarkdownDescription(props.step1);
      const bonus = props.step1.bonusAmount;
      const payload = buildCreateJobPayload({
        step1: props.step1,
        description: desc,
        bonusAmount: bonus,
      });
      return replaceDraftJob({
        previousId: draftJobId,
        payload,
        jdText: desc,
      });
    },
    onSuccess: (data) => {
      const desc = buildMarkdownDescription(props.step1);
      setAfterAiRun({
        step1Hash: hashStep1(props.step1),
        draftJobId: data.jobId,
        postedDescription: desc,
        postedBonus: props.step1.bonusAmount,
        parseResult: data.parse,
      });
      toast({ title: "AI review ready" });
    },
    onError: (e) => {
      toast({
        title: "AI review failed",
        description: formatApiError(e),
        variant: "destructive",
      });
    },
  });

  const applyChoice = useMutation({
    mutationFn: async (choice: AiChoice) => {
      const st = useJobWizardStore.getState();
      if (!st.parseResult?.parsed || st.draftJobId == null) {
        throw new Error("Run AI verification first.");
      }
      const parsed = st.parseResult.parsed as Record<string, unknown>;
      const merged = buildAiMergedDescription(props.step1, parsed);
      const keep = buildMarkdownDescription(props.step1);
      const targetDesc = choice === "accept" ? merged : keep;
      const bonus = st.lastPostedBonus ?? props.step1.bonusAmount;

      if (targetDesc !== st.lastPostedDescription) {
        const payload = buildCreateJobPayload({
          step1: props.step1,
          description: targetDesc,
          bonusAmount: bonus,
        });
        const { jobId, parse } = await replaceDraftJob({
          previousId: st.draftJobId,
          payload,
          jdText: targetDesc,
        });
        setDraftMeta({
          draftJobId: jobId,
          postedDescription: targetDesc,
          postedBonus: bonus,
          parseResult: parse,
        });
      }

      return { choice, finalDescription: targetDesc };
    },
    onSuccess: ({ choice, finalDescription }) => {
      setAiChoice(choice, finalDescription);
      toast({
        title: choice === "accept" ? "Using AI-enhanced wording" : "Keeping your version",
      });
      props.onNext();
    },
    onError: (e) => {
      toast({
        title: "Could not apply choice",
        description: formatApiError(e),
        variant: "destructive",
      });
    },
  });

  const parsedRecord = parseResult?.parsed as Record<string, unknown> | undefined;
  const origDesc = props.step1.description.trim();
  const origReq = props.step1.requirements.trim();
  const aiDesc =
    parsedRecord != null
      ? buildAiDescriptionPreview(props.step1, parsedRecord)
      : "";
  const aiReq =
    parsedRecord != null ? buildAiRequirementsPreview(parsedRecord) : "";
  const salaryNote =
    parsedRecord != null
      ? salaryMarketNote(props.step1, parsedRecord)
      : "Run AI verification to compare salary with inferred seniority.";

  const busy = runAi.isPending || applyChoice.isPending;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            AI verification
          </h2>
          <p className="text-sm text-muted-foreground">
            Mandatory review powered by your backend job parser. Choose whether
            to merge structured AI output into the posting.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => props.onBack()}
          >
            Back
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => runAi.mutate()}
          >
            {runAi.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {parseResult ? "Re-run AI verification" : "Run AI verification"}
          </Button>
        </div>
      </div>

      {parseResult?.requiresReview ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Parser confidence is low, review the structured output carefully before
          publishing.
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <DiffCard
          title="Description"
          subtitle="Overview text"
          leftLabel="Your version"
          rightLabel="AI-enriched preview"
          left={origDesc}
          right={aiDesc || "—"}
        />
        <DiffCard
          title="Requirements"
          subtitle="Stack & must-haves"
          leftLabel="Your version"
          rightLabel="AI-extracted skills"
          left={origReq}
          right={aiReq || "—"}
        />
      </section>

      <section className="rounded-lg border bg-muted/30 p-4">
        <h3 className="text-sm font-medium">Salary sense-check</h3>
        <p className="mt-2 text-sm text-muted-foreground">{salaryNote}</p>
        <p className="mt-2 font-mono text-sm">
          {typeof props.step1.salaryMin === "number"
            ? props.step1.salaryMin.toLocaleString()
            : "—"}{" "}
          –{" "}
          {typeof props.step1.salaryMax === "number"
            ? props.step1.salaryMax.toLocaleString()
            : "—"}{" "}
          USD
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="sm:min-w-[200px]"
          disabled={!parseResult || busy}
          onClick={() => applyChoice.mutate("accept")}
        >
          {applyChoice.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Accept AI suggestions
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="sm:min-w-[200px]"
          disabled={!parseResult || busy}
          onClick={() => applyChoice.mutate("keep")}
        >
          {applyChoice.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Keep my version
        </Button>
      </div>

      {!parseResult ? (
        <p className="text-center text-sm text-muted-foreground">
          Run AI verification to unlock the comparison and continue.
        </p>
      ) : null}
    </div>
  );
}

function DiffCard(props: {
  title: string;
  subtitle: string;
  leftLabel: string;
  rightLabel: string;
  left: string;
  right: string;
}) {
  return (
    <div className="rounded-xl border">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{props.title}</h3>
          <Badge variant="secondary" className="text-xs font-normal">
            {props.subtitle}
          </Badge>
        </div>
      </div>
      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b md:border-b-0 md:border-r">
          <div className="bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            {props.leftLabel}
          </div>
          <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap p-4 text-sm leading-relaxed">
            {props.left || "—"}
          </pre>
        </div>
        <div>
          <div className="bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            {props.rightLabel}
          </div>
          <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap p-4 text-sm leading-relaxed">
            {props.right || "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
