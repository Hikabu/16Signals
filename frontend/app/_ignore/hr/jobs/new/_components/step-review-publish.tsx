"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  JobsController_confirmRequirements,
  JobsController_publishPatch,
} from "@/lib/api";
import { useJobWizardStore } from "../_lib/job-wizard-store";
import {
  formatApiError,
  mapParsedToConfirmBody,
} from "../_lib/wizard-utils";
import type { Step1JobForm } from "../_lib/wizard-types";

export function StepReviewPublish(props: {
  step1: Step1JobForm;
  onBack: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const {
    draftJobId,
    finalDescription,
    parseResult,
    aiChoice,
    escrowEnabled,
    escrowFunded,
    escrowAmount,
  } = useJobWizardStore();

  const finalize = useMutation({
    mutationFn: async (publish: boolean) => {
      const st = useJobWizardStore.getState();
      if (!st.draftJobId || !st.parseResult?.parsed) {
        throw new Error("Job is not ready to finalize.");
      }
      const body = mapParsedToConfirmBody(
        st.parseResult.parsed as Record<string, unknown>,
      );
      await JobsController_confirmRequirements({
        path: { id: st.draftJobId },
        body,
      } as never);
      if (publish) {
        await JobsController_publishPatch({
          path: { id: st.draftJobId },
        } as never);
      }
      return { publish };
    },
    onSuccess: ({ publish }) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({
        title: publish
          ? "Job published successfully"
          : "Job saved as draft",
      });
      router.push(publish ? "/hr/jobs/active" : "/hr/jobs/draft");
    },
    onError: (e) => {
      toast({
        title: "Something went wrong",
        description: formatApiError(e),
        variant: "destructive",
      });
    },
  });

  const busy = finalize.isPending;
  const preview =
    (finalDescription ?? "").slice(0, 480) +
    ((finalDescription ?? "").length > 480 ? "…" : "");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Review & publish
          </h2>
          <p className="text-sm text-muted-foreground">
            Confirm structured requirements are saved, then publish or keep the
            draft.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => props.onBack()}
        >
          Back
        </Button>
      </div>

      <section className="space-y-3 rounded-xl border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium">{props.step1.title}</h3>
          {aiChoice === "accept" ? (
            <Badge className="gap-1">
              <Sparkles className="h-3 w-3" />
              AI-refined copy
            </Badge>
          ) : (
            <Badge variant="secondary">Original copy</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {preview || "—"}
        </p>
      </section>

      <section className="rounded-xl border p-5 text-sm">
        <h4 className="font-medium">Escrow</h4>
        <p className="mt-2 text-muted-foreground">
          {escrowEnabled ? (
            <>
              Enabled · target{" "}
              <span className="font-mono">{escrowAmount}</span> USDT
              {escrowFunded ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {" "}
                  · funded
                </span>
              ) : (
                <span> · not confirmed on-chain yet</span>
              )}
            </>
          ) : (
            "Disabled for this posting."
          )}
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="sm:min-w-[160px]"
          disabled={busy || !draftJobId || !parseResult}
          onClick={() => finalize.mutate(false)}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Save as Draft
        </Button>
        <Button
          type="button"
          className="sm:min-w-[160px]"
          disabled={busy || !draftJobId || !parseResult}
          onClick={() => finalize.mutate(true)}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Publish Job
        </Button>
      </div>
    </div>
  );
}
