"use client";

import { useCallback, useState } from "react";
import { CheckCircle, Loader2, ChevronLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// ─── Config ───────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

const ROLE_CHIPS = [
  "Designer",
  "Product Manager",
  "Marketing / GTM",
  "Data Analyst",
  "DevRel",
  "Sales",
  "Operations",
  "Legal / Finance",
];

// ─── Chip ────────────────────────────────────────────────────────────────────

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
        "rounded-full border px-3 py-1 text-xs font-medium transition-all",
        selected
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormData {
  email: string;
  name: string;
  role: string;
  otherRole: string;
  tools: string;
}

type Status = "idle" | "submitting" | "success" | "duplicate" | "error";
type EmailStatus = "idle" | "checking" | "ok" | "duplicate";

// ─── NonDeveloperWaitlistCard ─────────────────────────────────────────────────

export function NonDeveloperWaitlistCard({
  onBack,
}: {
  onBack: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [showOtherRole, setShowOtherRole] = useState(false);
  const [data, setData] = useState<FormData>({
    email: "",
    name: "",
    role: "",
    otherRole: "",
    tools: "",
  });

  // ── Email dedup check ──────────────────────────────────────────────────────
  const checkEmail = useCallback(async (email: string) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setEmailStatus("checking");
    try {
      const res = await fetch(
        `${API}/profile/candidate-waitlist/status?email=${encodeURIComponent(email)}`
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
  async function handleSubmit() {
    if (!data.email || emailStatus === "duplicate") return;
    setStatus("submitting");
    setError("");

    try {
      const res = await fetch(`${API}/profile/candidate-waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          name: data.name || undefined,
          role: data.role || undefined,
          otherRole: data.otherRole || undefined,
          tools: data.tools || undefined,
        }),
      });

      if (res.status === 409) {
        setStatus("duplicate");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as any).message ?? "Something went wrong.");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  // ── Success view ───────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold">You're on the list</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll reach out as soon as we support your role.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Duplicate view ─────────────────────────────────────────────────────────
  if (status === "duplicate") {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <CheckCircle className="h-7 w-7 text-amber-500" />
          </div>
          <div>
            <p className="text-lg font-semibold">Already registered</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.email} is already on the waitlist. We'll be in touch!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <button
          type="button"
          onClick={onBack}
          className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <CardTitle>
          {step === 1 ? "Get notified when we're ready for you" : "Tell us a bit more"}
        </CardTitle>
        <CardDescription>
          {step === 1
            ? "16Signals is currently built for developers. Join the list — we'll email you when we support your role."
            : "Optional — helps us prioritise what to build next."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Step 1: Contact ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="nd-email">Work email</Label>
              <Input
                id="nd-email"
                type="email"
                placeholder="you@company.com"
                value={data.email}
                onChange={(e) => {
                  setData((d) => ({ ...d, email: e.target.value }));
                  setEmailStatus("idle");
                }}
                onBlur={(e) => checkEmail(e.target.value)}
              />
              {emailStatus === "checking" && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking…
                </p>
              )}
              {emailStatus === "duplicate" && (
                <p className="text-xs text-amber-500">
                  This email is already registered.
                </p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-1">
              <Label htmlFor="nd-name">
                Name{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="nd-name"
                type="text"
                placeholder="Your name"
                value={data.name}
                onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            <Button
              className="w-full"
              disabled={!data.email || emailStatus === "duplicate" || emailStatus === "checking"}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>

            {emailStatus === "duplicate" && (
              <Button variant="ghost" className="w-full" onClick={handleSubmit}>
                Continue anyway
              </Button>
            )}
          </div>
        )}

        {/* ── Step 2: Role + Tools ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Role chips */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                What's your role?{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {ROLE_CHIPS.map((r) => (
                  <Chip
                    key={r}
                    label={r}
                    selected={data.role === r}
                    onClick={() =>
                      setData((d) => ({ ...d, role: d.role === r ? "" : r }))
                    }
                  />
                ))}
                <Chip
                  label="+ Other"
                  selected={showOtherRole}
                  onClick={() => {
                    setShowOtherRole((v) => {
                      if (v) setData((d) => ({ ...d, otherRole: "" }));
                      return !v;
                    });
                    setData((d) => ({ ...d, role: "" }));
                  }}
                />
              </div>

              {showOtherRole && (
                <Input
                  autoFocus
                  type="text"
                  placeholder="e.g. Finance, Legal, HR…"
                  value={data.otherRole}
                  onChange={(e) =>
                    setData((d) => ({ ...d, otherRole: e.target.value }))
                  }
                />
              )}
            </div>

            {/* Tools */}
            <div className="space-y-2">
              <Label htmlFor="nd-tools" className="text-sm font-medium">
                Tools you use day-to-day{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="nd-tools"
                type="text"
                placeholder="e.g. Figma, Notion, Salesforce, Linear…"
                value={data.tools}
                onChange={(e) =>
                  setData((d) => ({ ...d, tools: e.target.value }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Helps us understand which integrations to prioritise.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                disabled={status === "submitting"}
                onClick={handleSubmit}
              >
                Skip &amp; join
              </Button>
              <Button
                className="flex-1"
                disabled={status === "submitting"}
                onClick={handleSubmit}
              >
                {status === "submitting" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Join waitlist
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
