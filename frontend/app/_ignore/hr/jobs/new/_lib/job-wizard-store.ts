import { create } from "zustand";
import type { AiChoice, ParseJdData, Step1JobForm } from "./wizard-types";

export type JobWizardStep = 1 | 2 | 3 | 4;

type State = {
  step: JobWizardStep;
  step1: Step1JobForm | null;
  /** Hash of step1 used when AI run last succeeded. */
  step1AiHash: string | null;
  draftJobId: string | null;
  lastPostedDescription: string | null;
  lastPostedBonus: number | null;
  parseResult: ParseJdData | null;
  aiChoice: AiChoice | null;
  /** Full description after mandatory AI step (merged or original). */
  finalDescription: string | null;
  escrowEnabled: boolean;
  escrowAmount: number;
  escrowFunded: boolean;
  escrowTxSignature: string;
  escrowInitData: unknown | null;
  setStep: (s: JobWizardStep) => void;
  setStep1: (v: Step1JobForm) => void;
  setAfterAiRun: (args: {
    step1Hash: string;
    draftJobId: string;
    postedDescription: string;
    postedBonus: number;
    parseResult: ParseJdData;
  }) => void;
  setAiChoice: (choice: AiChoice, finalDescription: string) => void;
  setParseResult: (p: ParseJdData) => void;
  setDraftMeta: (args: {
    draftJobId: string;
    postedDescription: string;
    postedBonus: number;
    parseResult: ParseJdData;
  }) => void;
  setEscrowEnabled: (v: boolean) => void;
  setEscrowAmount: (n: number) => void;
  setEscrowFunded: (v: boolean, txSig?: string) => void;
  setEscrowInitData: (v: unknown | null) => void;
  reset: () => void;
};

const initial = {
  step: 1 as JobWizardStep,
  step1: null as Step1JobForm | null,
  step1AiHash: null as string | null,
  draftJobId: null as string | null,
  lastPostedDescription: null as string | null,
  lastPostedBonus: null as number | null,
  parseResult: null as ParseJdData | null,
  aiChoice: null as AiChoice | null,
  finalDescription: null as string | null,
  escrowEnabled: false,
  escrowAmount: 0,
  escrowFunded: false,
  escrowTxSignature: "",
  escrowInitData: null as unknown | null,
};

export const useJobWizardStore = create<State>((set, get) => ({
  ...initial,
  setStep: (s) => set({ step: s }),
  setStep1: (v) => set({ step1: v }),
  setAfterAiRun: ({
    step1Hash,
    draftJobId,
    postedDescription,
    postedBonus,
    parseResult,
  }) =>
    set({
      step1AiHash: step1Hash,
      draftJobId,
      lastPostedDescription: postedDescription,
      lastPostedBonus: postedBonus,
      parseResult,
      aiChoice: null,
      finalDescription: null,
      escrowFunded: false,
      escrowTxSignature: "",
      escrowInitData: null,
    }),
  setAiChoice: (choice, finalDescription) =>
    set({ aiChoice: choice, finalDescription }),
  setParseResult: (parseResult) => set({ parseResult }),
  setDraftMeta: ({ draftJobId, postedDescription, postedBonus, parseResult }) =>
    set({
      draftJobId,
      lastPostedDescription: postedDescription,
      lastPostedBonus: postedBonus,
      parseResult,
      escrowFunded: false,
      escrowTxSignature: "",
      escrowInitData: null,
    }),
  setEscrowEnabled: (escrowEnabled) =>
    set({ escrowEnabled, escrowInitData: null }),
  setEscrowAmount: (escrowAmount) =>
    set({ escrowAmount, escrowInitData: null }),
  setEscrowFunded: (escrowFunded, txSig) =>
    set({
      escrowFunded,
      escrowTxSignature: txSig ?? get().escrowTxSignature,
    }),
  setEscrowInitData: (escrowInitData) => set({ escrowInitData }),
  reset: () => set(initial),
}));
