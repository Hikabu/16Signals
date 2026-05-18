import type { components } from "@/src/api/schema";
import { ApiError } from "@/lib/api";
import type { JobRoleType, Step1JobForm } from "./wizard-types";

export const ROLE_TYPES: JobRoleType[] = [
  "BACKEND",
  "FRONTEND",
  "FULLSTACK",
  "INFRASTRUCTURE",
  "DATA_ML",
  "SMART_CONTRACT",
  "WEB3_BACKEND",
  "WEB3_FRONTEND",
  "WEB3_FULLSTACK",
  "DEFI_PROTOCOL",
  "SECURITY_WEB3",
  "SECURITY",
  "GENERALIST",
];

export function hashStep1(s: Step1JobForm): string {
  return JSON.stringify({
    title: s.title.trim(),
    description: s.description.trim(),
    requirements: s.requirements.trim(),
    responsibilities: s.responsibilities.trim(),
    salaryMin: s.salaryMin === "" ? null : s.salaryMin,
    salaryMax: s.salaryMax === "" ? null : s.salaryMax,
    location: s.location.trim(),
    employmentType: s.employmentType.trim(),
    bonusAmount: s.bonusAmount,
    roleType: s.roleType.trim(),
    currency: s.currency.trim(),
  });
}

function numericOrNull(v: number | ""): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Full markdown stored as `CreateJobDto.description` (matches prior single-page behavior). */
export function buildMarkdownDescription(s: Step1JobForm): string {
  const min = numericOrNull(s.salaryMin);
  const max = numericOrNull(s.salaryMax);
  const salaryLine =
    min != null &&
    max != null &&
    (min > 0 || max > 0)
      ? `Salary range: ${formatMoney(min)} – ${formatMoney(max)} USD`
      : "Salary range: Not specified";

  const lines = [
    s.description.trim(),
    "",
    "## Responsibilities",
    s.responsibilities.trim(),
    "",
    "## Requirements",
    s.requirements.trim(),
    "",
    "## Compensation & logistics",
    salaryLine,
    s.location.trim() ? `Location: ${s.location.trim()}` : "",
    s.employmentType.trim()
      ? `Employment type: ${s.employmentType.trim()}`
      : "",
  ];

  return lines.filter((line) => line !== "").join("\n");
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(n);
}

type ParsedLike = {
  requiredSkills?: string[];
  requiredRoleType?: string;
  seniorityLevel?: string;
  parserConfidence?: number;
};

export function buildAiMergedDescription(
  s: Step1JobForm,
  parsedRaw: Record<string, unknown>,
): string {
  const parsed = parsedRaw as ParsedLike;
  const skills = parsed.requiredSkills ?? [];
  const role = parsed.requiredRoleType ?? "GENERALIST";
  const seniority = parsed.seniorityLevel ?? "MID";
  const conf =
    typeof parsed.parserConfidence === "number"
      ? parsed.parserConfidence
      : 0;

  const skillBullets =
    skills.length > 0
      ? skills.map((sk) => `- ${sk}`).join("\n")
      : s.requirements.trim();

  const aiNote = `\n\n_AI structured review:_ role focus **${String(role).replace(/_/g, " ")}** at **${String(seniority).toLowerCase()}** level (parser confidence **${Math.round(conf * 100)}%**).`;

  const overview = [s.description.trim(), aiNote].join("\n");

  const lines = [
    overview,
    "",
    "## Responsibilities",
    s.responsibilities.trim(),
    "",
    "## Requirements",
    "(Refined from AI extraction of your original text)",
    skillBullets,
    "",
    "## Compensation & logistics",
    (() => {
      const min = numericOrNull(s.salaryMin);
      const max = numericOrNull(s.salaryMax);
      if (min == null || max == null) return "Salary range: Not specified";
      if (min <= 0 && max <= 0) return "Salary range: Not specified";
      return `Salary range: ${formatMoney(min)} – ${formatMoney(max)} USD`;
    })(),
    s.location.trim() ? `Location: ${s.location.trim()}` : "",
    s.employmentType.trim()
      ? `Employment type: ${s.employmentType.trim()}`
      : "",
  ];

  return lines.filter((line) => line !== "").join("\n");
}

export function buildAiRequirementsPreview(parsedRaw: Record<string, unknown>): string {
  const parsed = parsedRaw as ParsedLike;
  const skills = parsed.requiredSkills ?? [];
  if (!skills.length) return "—";
  return skills.map((sk) => `- ${sk}`).join("\n");
}

export function buildAiDescriptionPreview(
  s: Step1JobForm,
  parsedRaw: Record<string, unknown>,
): string {
  const parsed = parsedRaw as ParsedLike;
  const skills = parsed.requiredSkills ?? [];
  const tail =
    skills.length > 0
      ? `\n\n**Highlighted stack & themes:** ${skills.slice(0, 12).join(", ")}${skills.length > 12 ? "…" : ""}`
      : "";
  return `${s.description.trim()}${tail}`;
}

export function salaryMarketNote(
  s: Step1JobForm,
  parsedRaw: Record<string, unknown>,
): string {
  const parsed = parsedRaw as ParsedLike;
  const seniority = (parsed.seniorityLevel ?? "MID").toUpperCase();
  const min = numericOrNull(s.salaryMin);
  const max = numericOrNull(s.salaryMax);
  const mid = min != null && max != null ? (min + max) / 2 : NaN;
  if (!Number.isFinite(mid) || mid <= 0) {
    return "Add a salary range so AI can sanity-check it against the inferred seniority.";
  }
  if (seniority === "SENIOR" && mid < 90000) {
    return "For roles inferred as **senior**, this range sits below typical US tech bands, double-check unless this is a non-US or equity-heavy package.";
  }
  if (seniority === "JUNIOR" && mid > 140000) {
    return "For **junior**-shaped roles, this range is ambitious, ensure scope matches the level.";
  }
  return "Range looks broadly consistent with the inferred seniority; still validate against your market and location.";
}

function mapParserRoleToRoleType(raw: string | undefined): JobRoleType {
  const r = (raw ?? "GENERALIST").toUpperCase();
  const table: Record<string, JobRoleType> = {
    BACKEND: "BACKEND",
    FRONTEND: "FRONTEND",
    FULLSTACK: "FULLSTACK",
    DEVOPS: "INFRASTRUCTURE",
    INFRASTRUCTURE: "INFRASTRUCTURE",
    DATA: "DATA_ML",
    DATA_ML: "DATA_ML",
    MOBILE: "GENERALIST",
    SMART_CONTRACT: "SMART_CONTRACT",
    WEB3_BACKEND: "WEB3_BACKEND",
    WEB3_FRONTEND: "WEB3_FRONTEND",
    WEB3_FULLSTACK: "WEB3_FULLSTACK",
    DEFI_PROTOCOL: "DEFI_PROTOCOL",
    SECURITY_WEB3: "SECURITY_WEB3",
    SECURITY: "SECURITY",
    GENERALIST: "GENERALIST",
  };
  return table[r] ?? "GENERALIST";
}

function mapSeniority(raw: string | undefined): "JUNIOR" | "MID" | "SENIOR" | "LEAD" {
  const l = (raw ?? "MID").toUpperCase();
  if (l.includes("JUNIOR")) return "JUNIOR";
  if (l.includes("SENIOR")) return "SENIOR";
  if (l.includes("LEAD")) return "LEAD";
  return "MID";
}

/** Builds confirm-requirements body from parse-jd `parsed` blob with safe defaults. */
export function mapParsedToConfirmBody(
  parsedRaw: Record<string, unknown>,
): components["schemas"]["ParsedJobRequirementsSwaggerDto"] {
  const p = parsedRaw as ParsedLike & {
    collaborationWeight?: "LOW" | "MEDIUM" | "HIGH";
    ownershipWeight?: "LOW" | "MEDIUM" | "HIGH";
    innovationWeight?: "LOW" | "MEDIUM" | "HIGH";
    isWeb3Role?: boolean;
  };

  return {
    requiredSkills: Array.isArray(p.requiredSkills)
      ? p.requiredSkills.map(String)
      : [],
    requiredRoleType: mapParserRoleToRoleType(p.requiredRoleType),
    seniorityLevel: mapSeniority(p.seniorityLevel),
    collaborationWeight: p.collaborationWeight ?? "MEDIUM",
    ownershipWeight: p.ownershipWeight ?? "MEDIUM",
    innovationWeight: p.innovationWeight ?? "MEDIUM",
    isWeb3Role: typeof p.isWeb3Role === "boolean" ? p.isWeb3Role : false,
    parserConfidence:
      typeof p.parserConfidence === "number" ? p.parserConfidence : 0.7,
  };
}

export function resolveRoleTypeForCreate(
  raw: string | undefined,
): JobRoleType | undefined {
  const t = raw?.trim().toUpperCase();
  if (!t) return undefined;
  return ROLE_TYPES.includes(t as JobRoleType) ? (t as JobRoleType) : undefined;
}

export function buildCreateJobPayload(args: {
  step1: Step1JobForm;
  description: string;
  bonusAmount: number;
}): components["schemas"]["CreateJobDto"] & { roleType?: JobRoleType } {
  const { step1, description, bonusAmount } = args;
  const roleType = resolveRoleTypeForCreate(step1.roleType);
  const payload: components["schemas"]["CreateJobDto"] & {
    roleType?: JobRoleType;
  } = {
    title: step1.title.trim(),
    description,
    location: step1.location.trim() || undefined,
    employmentType: step1.employmentType.trim() || undefined,
    bonusAmount,
    currency: step1.currency.trim() || "USDT",
  };
  if (roleType) payload.roleType = roleType;
  return payload;
}

export function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const b = error.body;
    if (typeof b === "string" && b.trim()) return b;
    if (b && typeof b === "object" && "message" in b) {
      const msg = (b as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
