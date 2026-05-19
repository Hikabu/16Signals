"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  EscrowController_confirmFunded,
  EscrowController_initParams,
  unwrapApiSuccessData,
} from "@/lib/api";
import { useJobWizardStore } from "../_lib/job-wizard-store";
import { replaceDraftJob } from "../_lib/wizard-draft";
import {
  buildCreateJobPayload,
  formatApiError,
} from "../_lib/wizard-utils";
import type { Step1JobForm } from "../_lib/wizard-types";

type InitData = {
  escrowId: string;
  expectedAmount: string;
  escrowAddress: string;
};

function usdtFromAtomic6(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return (n / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export function StepEscrow(props: {
  step1: Step1JobForm;
  onBack: () => void;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const {
    draftJobId,
    finalDescription,
    lastPostedBonus,
    escrowEnabled,
    escrowAmount,
    escrowFunded,
    setEscrowEnabled,
    setEscrowAmount,
    setEscrowFunded,
    setEscrowInitData,
    escrowInitData,
    setDraftMeta,
  } = useJobWizardStore();

  const loadInit = useMutation({
    mutationFn: async () => {
      let st = useJobWizardStore.getState();
      const id0 = st.draftJobId;
      if (!id0 || !st.finalDescription) throw new Error("Missing draft job.");

      if (
        st.escrowEnabled &&
        st.escrowAmount > 0 &&
        st.escrowAmount !== st.lastPostedBonus
      ) {
        const payload = buildCreateJobPayload({
          step1: props.step1,
          description: st.finalDescription,
          bonusAmount: st.escrowAmount,
        });
        const { jobId, parse } = await replaceDraftJob({
          previousId: id0,
          payload,
          jdText: st.finalDescription,
        });
        setDraftMeta({
          draftJobId: jobId,
          postedDescription: st.finalDescription,
          postedBonus: st.escrowAmount,
          parseResult: parse,
        });
        st = useJobWizardStore.getState();
      }

      const id = st.draftJobId;
      if (!id) throw new Error("Missing draft job.");
      const raw = await EscrowController_initParams({
        path: { jobPostId: id },
      } as never);
      return unwrapApiSuccessData<InitData>(raw);
    },
    onSuccess: (data) => {
      setEscrowInitData(data);
      toast({ title: "Escrow instructions loaded" });
    },
    onError: (e) => {
      toast({
        title: "Could not load escrow params",
        description: formatApiError(e),
        variant: "destructive",
      });
    },
  });

  const confirmFunded = useMutation({
    mutationFn: async () => {
      const st = useJobWizardStore.getState();
      const init = st.escrowInitData as InitData | null;
      if (!init?.escrowAddress || !st.draftJobId) {
        throw new Error("Load funding instructions first.");
      }
      return EscrowController_confirmFunded({
        body: {
          jobPostId: st.draftJobId,
          escrowAddress: init.escrowAddress,
        },
      } as never);
    },
    onSuccess: () => {
      setEscrowFunded(true);
      toast({ title: "Escrow marked as funded" });
    },
    onError: (e) => {
      toast({
        title: "Confirmation failed",
        description: formatApiError(e),
        variant: "destructive",
      });
    },
  });

  const continueNext = useMutation({
    mutationFn: async () => {
      const st = useJobWizardStore.getState();
      if (!st.draftJobId || !st.finalDescription) {
        throw new Error("Complete the AI step first.");
      }
      const targetBonus = st.escrowEnabled ? st.escrowAmount : props.step1.bonusAmount;
      if (st.escrowEnabled && (!Number.isFinite(targetBonus) || targetBonus <= 0)) {
        throw new Error("Enter a positive USDT amount for escrow.");
      }
      if (
        st.escrowFunded &&
        targetBonus !== st.lastPostedBonus
      ) {
        throw new Error(
          "Bonus amount is locked after funding, go back without funding if you need to change it.",
        );
      }
      if (targetBonus !== st.lastPostedBonus) {
        const payload = buildCreateJobPayload({
          step1: props.step1,
          description: st.finalDescription,
          bonusAmount: targetBonus,
        });
        const { jobId, parse } = await replaceDraftJob({
          previousId: st.draftJobId,
          payload,
          jdText: st.finalDescription,
        });
        setDraftMeta({
          draftJobId: jobId,
          postedDescription: st.finalDescription,
          postedBonus: targetBonus,
          parseResult: parse,
        });
      }
    },
    onSuccess: () => {
      props.onNext();
    },
    onError: (e) => {
      toast({
        title: "Cannot continue",
        description: formatApiError(e),
        variant: "destructive",
      });
    },
  });

  const init = escrowInitData as InitData | null;
  const busy =
    loadInit.isPending || confirmFunded.isPending || continueNext.isPending;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Trust escrow (optional)
        </h2>
        <p className="text-sm text-muted-foreground">
          Decide whether to fund an on-chain USDT escrow for this role. The job
          bonus amount on the draft must match what you fund, we sync it before
          you load wallet instructions.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border p-4">
        <Checkbox
          id="escrow-toggle"
          checked={escrowEnabled}
          disabled={busy || escrowFunded}
          onCheckedChange={(c) => {
            setEscrowEnabled(c === true);
            if (c !== true) {
              setEscrowInitData(null);
            }
          }}
        />
        <div className="space-y-1">
          <Label htmlFor="escrow-toggle" className="cursor-pointer text-base">
            Add trust escrow funding
          </Label>
          <p className="text-sm text-muted-foreground">
            Uses Solana USDT with your linked employer wallet (see backend
            escrow docs). Connect with Phantom or another Solana wallet, not
            MetaMask.
          </p>
        </div>
      </div>

      {escrowEnabled ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="escrow-amt">Escrow amount (USDT)</Label>
            <Input
              id="escrow-amt"
              type="number"
              min={0}
              step="1"
              disabled={busy || escrowFunded}
              value={escrowAmount || ""}
              onChange={(e) =>
                setEscrowAmount(Number(e.target.value) || 0)
              }
            />
            <p className="text-xs text-muted-foreground">
              This becomes the job&apos;s bonus target so init-params match the
              on-chain transfer.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            <p className="font-medium">Funding flow</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Load funding instructions, the draft bonus is synced first if it
                does not match this amount.
              </li>
              <li>Send USDT from your Solana wallet to the escrow PDA shown below.</li>
              <li>
                Confirm funding so the backend can verify the transfer on-chain.
              </li>
            </ol>
          </div>

          {draftJobId && lastPostedBonus != null ? (
            <p className="text-xs text-muted-foreground">
              Draft bonus on server:{" "}
              <span className="font-mono">{lastPostedBonus}</span> USDT
              {escrowAmount !== lastPostedBonus
                ? ", Continue will update the draft to match the escrow amount."
                : null}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !draftJobId || escrowAmount <= 0}
              onClick={() => loadInit.mutate()}
            >
              {loadInit.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Load funding instructions
            </Button>
            <Button
              type="button"
              disabled={busy || !init?.escrowAddress || escrowFunded}
              onClick={() => confirmFunded.mutate()}
            >
              {confirmFunded.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm funded (after on-chain transfer)
            </Button>
          </div>

          {init ? (
            <div className="space-y-2 rounded-md border p-4 font-mono text-sm">
              <div>
                <span className="text-muted-foreground">Escrow PDA: </span>
                {init.escrowAddress}
              </div>
              <div>
                <span className="text-muted-foreground">Expected USDT: </span>
                {usdtFromAtomic6(init.expectedAmount)} (atomic {init.expectedAmount})
              </div>
              <div>
                <span className="text-muted-foreground">Escrow id: </span>
                {init.escrowId}
              </div>
            </div>
          ) : null}

          {escrowFunded ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Escrow funding recorded for this job.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Escrow disabled, you can still publish or save a draft without
          on-chain funding.
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-3">
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
          disabled={busy || !finalDescription}
          onClick={() => continueNext.mutate()}
        >
          {continueNext.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Continue to review
        </Button>
      </div>
    </div>
  );
}
