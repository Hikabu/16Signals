"use client";

import { useState, useCallback } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Building2,
  BellRing,
  Github,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const IS_CANDIDATE_ONLY = process.env.NEXT_PUBLIC_CANDIDATE_ONLY === "true";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Constants ────────────────────────────────────────────────────────────────

const ENG_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Data / ML Engineer",
  "Web3 / Smart Contract",
];

const OTHER_ROLES = [
  "Designer",
  "Product Manager",
  "DevRel",
  "Marketing / GTM",
  "Sales",
];

const COMPANY_TYPES = [
  "Startup",
  "Scaleup",
  "Web3 / Crypto",
  "Enterprise",
  "Agency",
];

const TEAM_SIZES = ["1–10", "11–50", "51–200", "200+"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormData {
  email: string;
  companyName: string;
  website: string;
  rolesHiring: string[];
  otherRolesText: string;
  usesGithub: boolean;
  evalTools: string;
  needsOtherRoleTools: boolean;
  companyTypes: string[];
  teamSize: string;
  socialLinks: string;
}

type EmailStatus = "idle" | "checking" | "duplicate" | "ok";
type SubmitStatus = "idle" | "submitting" | "success" | "error";

interface EmployerAuthCardProps {
  onSwitchToCandidate?: () => void;
  candidateOnly?: boolean;
}

// ── Chip toggle helper ────────────────────────────────────────────────────────

function toggle(arr: string[], item: string) {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

// ── Chip button ───────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-2 text-xs font-medium transition-all duration-150 select-none cursor-pointer min-h-[40px] sm:min-h-0 sm:py-1.5",
        selected
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:border-border/70 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function StepProgress({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {step > 1 ? "✓" : "1"}
        </div>
        <span className={cn("text-xs font-medium", step === 1 ? "text-foreground" : "text-muted-foreground")}>
          Contact
        </span>
      </div>
      <div className="h-px flex-1 bg-border" />
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
            step === 2
              ? "bg-primary text-primary-foreground"
              : "border border-border text-muted-foreground"
          )}
        >
          2
        </div>
        <span className={cn("text-xs font-medium", step === 2 ? "text-foreground" : "text-muted-foreground")}>
          About you
        </span>
      </div>
    </div>
  );
}

// ── Waitlist wizard ───────────────────────────────────────────────────────────

function EmployerWaitlistWizard({
  onSwitchToCandidate,
}: {
  onSwitchToCandidate?: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [showOtherRoles, setShowOtherRoles] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState("");
  const [data, setData] = useState<FormData>({
    email: "",
    companyName: "",
    website: "",
    rolesHiring: [],
    otherRolesText: "",
    usesGithub: false,
    evalTools: "",
    needsOtherRoleTools: false,
    companyTypes: [],
    teamSize: "",
    socialLinks: "",
  });

  // ── Dedup check on email blur ──────────────────────────────────────────────

  const checkEmail = useCallback(async (email: string) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setEmailStatus("checking");
    try {
      const res = await fetch(
        `${API}/employer/waitlist/status?email=${encodeURIComponent(email)}`
      );
      if (res.ok) {
        const body = await res.json();
        setEmailStatus(body.registered ? "duplicate" : "ok");
      } else {
        setEmailStatus("idle");
      }
    } catch {
      setEmailStatus("idle");
    }
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function submit() {
    setSubmitStatus("submitting");
    setSubmitError("");
    try {
      const res = await fetch(`${API}/employer/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          companyName: data.companyName,
          website: data.website || undefined,
          rolesHiring: data.rolesHiring.length ? data.rolesHiring : undefined,
          otherRolesText: data.otherRolesText || undefined,
          usesGithub: data.usesGithub || undefined,
          evalTools: data.evalTools || undefined,
          needsOtherRoleTools: data.needsOtherRoleTools || undefined,
          companyTypes: data.companyTypes.length ? data.companyTypes : undefined,
          teamSize: data.teamSize || undefined,
          socialLinks: data.socialLinks || undefined,
        }),
      });
      if (res.status === 409) {
        setEmailStatus("duplicate");
        setStep(1);
        setSubmitStatus("idle");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Something went wrong.");
      }
      setSubmitStatus("success");
    } catch (err: any) {
      setSubmitError(err.message ?? "Failed to join waitlist.");
      setSubmitStatus("error");
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (submitStatus === "success") {
    return (
      <Card className="mx-auto w-full max-w-md border-primary/20 bg-card">
        <CardContent className="flex flex-col items-center gap-5 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">
              You're on the list!
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We'll reach out to{" "}
              <span className="font-medium text-foreground">{data.email}</span>{" "}
              as soon as employer access opens. Our team may be in touch to
              learn more about your hiring needs.
            </p>
          </div>
          {onSwitchToCandidate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-muted-foreground"
              onClick={onSwitchToCandidate}
            >
              I'm also a candidate
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  if (step === 1) {
    const canContinue =
      data.email.trim() &&
      data.companyName.trim() &&
      emailStatus !== "duplicate" &&
      emailStatus !== "checking";

    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/30">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl">Get early employer access</CardTitle>
          <CardDescription>
            Be first in line when 16Signals opens to companies.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <StepProgress step={1} />

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="emp-email">Work email *</Label>
            <Input
              id="emp-email"
              type="email"
              required
              placeholder="you@company.com"
              value={data.email}
              onChange={(e) => {
                setData((d) => ({ ...d, email: e.target.value }));
                setEmailStatus("idle");
              }}
              onBlur={() => checkEmail(data.email)}
              className={cn(
                emailStatus === "duplicate" && "border-destructive focus-visible:ring-destructive/20"
              )}
            />
            {emailStatus === "checking" && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking…
              </p>
            )}
            {emailStatus === "duplicate" && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <BellRing className="h-3 w-3" />
                This email is already on the waitlist — we'll be in touch.
              </p>
            )}
          </div>

          {/* Company name */}
          <div className="space-y-1.5">
            <Label htmlFor="emp-company">Company name *</Label>
            <Input
              id="emp-company"
              type="text"
              required
              placeholder="Acme Corp"
              value={data.companyName}
              onChange={(e) => setData((d) => ({ ...d, companyName: e.target.value }))}
            />
          </div>

          {/* Website (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="emp-website">
              Company website{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="emp-website"
              type="url"
              placeholder="https://acme.com"
              value={data.website}
              onChange={(e) => setData((d) => ({ ...d, website: e.target.value }))}
            />
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={!canContinue}
            onClick={() => setStep(2)}
          >
            Continue
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>

          {onSwitchToCandidate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={onSwitchToCandidate}
            >
              I'm a candidate, not an employer
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">A bit more about you</CardTitle>
        <CardDescription>
          Helps us match you to the right talent. All optional — skip anytime.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 overflow-y-auto max-h-[calc(100svh-220px)] sm:max-h-none pb-6">
        <StepProgress step={2} />

        {/* ── Roles: Engineering ─────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">What roles are you hiring?</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Select all that apply — helps us prioritise our roadmap.</p>
          </div>

          {/* Engineering row */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Engineering
            </p>
            <div className="flex flex-wrap gap-2">
              {ENG_ROLES.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  selected={data.rolesHiring.includes(r)}
                  onClick={() =>
                    setData((d) => ({ ...d, rolesHiring: toggle(d.rolesHiring, r) }))
                  }
                />
              ))}
            </div>
          </div>

          {/* Other roles row — collapsible, hidden by default */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                setShowOtherRoles((v) => {
                  // clear selections when collapsing
                  if (v) {
                    setData((d) => ({
                      ...d,
                      rolesHiring: d.rolesHiring.filter((r) => !OTHER_ROLES.includes(r)),
                      otherRolesText: "",
                    }));
                  }
                  return !v;
                });
              }}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              <span
                className={cn(
                  "inline-block transition-transform duration-150",
                  showOtherRoles ? "rotate-90" : "rotate-0"
                )}
              >
                ▶
              </span>
              Other roles
              {!showOtherRoles && (
                data.rolesHiring.some((r) => OTHER_ROLES.includes(r)) || data.otherRolesText.trim()
                  ? <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary normal-case tracking-normal">selected</span>
                  : <span className="ml-1 font-normal normal-case tracking-normal opacity-60">(optional)</span>
              )}
            </button>

            {showOtherRoles && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  {OTHER_ROLES.map((r) => (
                    <Chip
                      key={r}
                      label={r}
                      selected={data.rolesHiring.includes(r)}
                      onClick={() =>
                        setData((d) => ({ ...d, rolesHiring: toggle(d.rolesHiring, r) }))
                      }
                    />
                  ))}
                  {/* "Other" chip — reveals free text */}
                  <Chip
                    label="+ Other"
                    selected={data.otherRolesText.length > 0}
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        otherRolesText: d.otherRolesText.length > 0 ? "" : " ",
                      }))
                    }
                  />
                </div>
                {data.otherRolesText.length > 0 && (
                  <Input
                    autoFocus
                    type="text"
                    placeholder="Which role? (e.g. Legal, Finance, Operations…)"
                    value={data.otherRolesText.trim() === "" ? "" : data.otherRolesText}
                    onChange={(e) => setData((d) => ({ ...d, otherRolesText: e.target.value }))}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Evaluation tools ────────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">How do you evaluate candidates?</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Helps us understand what signals matter most to you.</p>
          </div>

          {/* GitHub checkbox */}
          <label
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:border-border/70 min-h-[52px]"
            onClick={() => setData((d) => ({ ...d, usesGithub: !d.usesGithub }))}
          >
            <div
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all",
                data.usesGithub ? "border-primary bg-primary" : "border-border bg-transparent"
              )}
            >
              {data.usesGithub && (
                <svg viewBox="0 0 12 12" className="h-3 w-3">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <Github className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm text-foreground leading-snug">We review GitHub activity / code to evaluate engineers</span>
          </label>

          {/* Free text for other engineer tools */}
          <Input
            id="emp-eval-tools"
            type="text"
            placeholder="Other tools for engineers (e.g. assignments, Loom, Greenhouse…)"
            value={data.evalTools}
            onChange={(e) => setData((d) => ({ ...d, evalTools: e.target.value }))}
          />

          {/* Tools-for-other-roles checkbox — only show if they selected non-eng roles */}
          {(data.rolesHiring.some((r) => OTHER_ROLES.includes(r)) || data.otherRolesText.trim().length > 0) && (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:border-border/70 min-h-[52px]"
              onClick={() => setData((d) => ({ ...d, needsOtherRoleTools: !d.needsOtherRoleTools }))}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all",
                  data.needsOtherRoleTools ? "border-primary bg-primary" : "border-border bg-transparent"
                )}
              >
                {data.needsOtherRoleTools && (
                  <svg viewBox="0 0 12 12" className="h-3 w-3">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-foreground leading-snug">
                Also interested in tools to evaluate non-engineering roles
              </span>
            </label>
          )}
        </div>

        {/* Company type (multi-select) */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Company type</Label>
          <div className="flex flex-wrap gap-2">
            {COMPANY_TYPES.map((t) => (
              <Chip
                key={t}
                label={t}
                selected={data.companyTypes.includes(t)}
                onClick={() =>
                  setData((d) => ({ ...d, companyTypes: toggle(d.companyTypes, t) }))
                }
              />
            ))}
          </div>
        </div>

        {/* Team size (optional) */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Team size{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {TEAM_SIZES.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={data.teamSize === s}
                onClick={() =>
                  setData((d) => ({ ...d, teamSize: d.teamSize === s ? "" : s }))
                }
              />
            ))}
          </div>
        </div>

        {/* Social links */}
        <div className="space-y-1.5">
          <Label htmlFor="emp-social">
            LinkedIn or Twitter{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="emp-social"
            type="text"
            placeholder="https://linkedin.com/company/acme"
            value={data.socialLinks}
            onChange={(e) => setData((d) => ({ ...d, socialLinks: e.target.value }))}
          />
        </div>

        {submitStatus === "error" && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {submitError}
          </p>
        )}

        {/* Actions — wrap on mobile */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0 px-4"
            onClick={() => setStep(1)}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 text-muted-foreground"
            disabled={submitStatus === "submitting"}
            onClick={submit}
          >
            Skip &amp; join
          </Button>

          <Button
            type="button"
            className="h-10 flex-1 sm:flex-none sm:ml-auto"
            disabled={submitStatus === "submitting"}
            onClick={submit}
          >
            {submitStatus === "submitting" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Join waitlist
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function EmployerAuthCard({
  onSwitchToCandidate,
  candidateOnly,
}: EmployerAuthCardProps) {
  // In candidate-only mode (or if prop explicitly set), show the waitlist wizard
  if (IS_CANDIDATE_ONLY || candidateOnly) {
    return <EmployerWaitlistWizard onSwitchToCandidate={onSwitchToCandidate} />;
  }

  // Fallback: Privy not configured message
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Employer Login</CardTitle>
        <CardDescription>
          Employer authentication is handled through Privy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          <p>
            Set <code className="font-mono text-xs">NEXT_PUBLIC_PRIVY_APP_ID</code> and enable
            Privy employer auth to use <code className="font-mono text-xs">/auth/employer/login</code>.
          </p>
        </div>
        {onSwitchToCandidate && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={onSwitchToCandidate}
          >
            Switch to candidate
            <ArrowUpRight className="size-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
