import type { components } from "@/src/api/schema";

export type JobRoleType = components["schemas"]["JobResponseDto"]["roleType"];

export type Step1JobForm = {
  title: string;
  description: string;
  requirements: string;
  responsibilities: string;
  salaryMin: number | "";
  salaryMax: number | "";
  location: string;
  employmentType: string;
  bonusAmount: number;
  roleType: string;
  currency: string;
};

export type AiChoice = "accept" | "keep";

export type ParseJdData = {
  parsed: Record<string, unknown>;
  requiresReview: boolean;
  diff: unknown;
};
