"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLogin, useLoginWithEmail, usePrivy } from "@privy-io/react-auth";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";

import { loginEmployerPrivy, getEmployerProfile } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrivyEmployerAuthCardProps {
  onLoginSuccess?: () => void;
  onSwitchToCandidate?: () => void;
}

type ActiveMethod = "email" | "wallet" | null;
type StatusKind = "error" | "success" | null;

const emailSchema = z.string().email("Enter a valid email.");
const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

// ─── PrivyEmployerAuthCard ────────────────────────────────────────────────────

export function PrivyEmployerAuthCard({
  onLoginSuccess,
  onSwitchToCandidate,
}: PrivyEmployerAuthCardProps) {
  const router = useRouter();
  const privy = usePrivy();
  const { login: walletLogin } = useLogin();
  const { sendCode, loginWithCode } = useLoginWithEmail();

  // Email OTP flow
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Wallet flow
  const [walletLoading, setWalletLoading] = useState(false);

  // Status message
  const [activeMethod, setActiveMethod] = useState<ActiveMethod>(null);
  const [status, setStatus] = useState<{ kind: StatusKind; message: string }>({
    kind: null,
    message: "",
  });

  const exchangeMutation = useMutation({
    mutationFn: async (tokenOverride?: string) => {
      const privyToken = tokenOverride ?? (await privy.getAccessToken());
      if (!privyToken) {
        throw new Error("Privy authentication is incomplete.");
      }

      console.debug("[PrivyEmployerAuthCard] Exchanging Privy token");
      return loginEmployerPrivy({ privyToken });
    },
    onSuccess: async (data) => {
      // Set token immediately so the API call has it
      useAuthStore.getState().setAuth({ token: data.token, role: "employer" });
      
      try {
        const profile = await getEmployerProfile();
        useAuthStore.getState().setAuth({ 
          token: data.token, 
          role: "employer",
          username: profile.name,
          email: profile.email,
          walletAddress: profile.walletAddress,
          id: profile.id
        });
      } catch (err) {
        console.error("Failed to fetch employer profile:", err);
      }

      onLoginSuccess?.();
      router.push("/hr/jobs/new");
    },
    onError: (err) => {
      setEmailLoading(false);
      setWalletLoading(false);
      console.error("[PrivyEmployerAuthCard] Backend exchange failed", err);
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Unable to verify employer login.",
      });
    },
  });

  useEffect(() => {
    if (!privy.ready || !privy.authenticated || !privy.user || activeMethod !== "wallet") {
      return;
    }

    exchangeMutation.mutate(undefined);
    // The mutation object is intentionally omitted to avoid re-running exchange
    // when React Query updates mutation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMethod, privy.authenticated, privy.ready, privy.user]);

  async function handleSendCode() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setStatus({
        kind: "error",
        message: parsed.error.issues[0]?.message ?? "",
      });
      return;
    }

    setActiveMethod("email");
    setEmailLoading(true);
    try {
      console.debug("[PrivyEmployerAuthCard] Sending OTP code", { email: parsed.data });
      await sendCode({ email: parsed.data });
      setEmailLoading(false);
      setOtpSent(true);
      setStatus({ kind: "success", message: "Code sent. Check your inbox." });
    } catch (err) {
      setEmailLoading(false);
      console.error("[PrivyEmployerAuthCard] sendCode failed", err);
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Unable to send code.",
      });
    }
  }

  async function handleVerifyOtp() {
    const parsed = otpSchema.safeParse(otp);
    if (!parsed.success) {
      setStatus({
        kind: "error",
        message: parsed.error.issues[0]?.message ?? "",
      });
      return;
    }

    setEmailLoading(true);
    try {
      console.debug("[PrivyEmployerAuthCard] Verifying OTP code");
      await loginWithCode({ code: parsed.data });
      const privyToken = await privy.getAccessToken();
      if (!privyToken) {
        throw new Error(
          "Privy authenticated but no access token returned. Check Privy app config.",
        );
      }
      setStatus({ kind: "success", message: "Verified. Logging you in..." });
      await exchangeMutation.mutateAsync(privyToken);
    } catch (err) {
      setEmailLoading(false);
      console.error("[PrivyEmployerAuthCard] loginWithCode failed", err);
      setStatus({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Invalid code. Try again.",
      });
    }
  }

  function handleWalletLogin() {
    setActiveMethod("wallet");
    setWalletLoading(true);
    walletLogin({ loginMethods: ["wallet"] });
    if (privy.authenticated) {
      setWalletLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      {/* Privy badge */}

      <CardHeader className="relative">
        <CardTitle>Employer Login</CardTitle>
        <CardDescription>Verify your identity with Privy.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Email OTP ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Label htmlFor="privy-email">Email</Label>
          <div className="flex gap-2">
            <Input
              id="privy-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={otpSent}
              className="flex-1"
            />
            {!otpSent && (
              <Button
                variant="outline"
                type="button"
                onClick={handleSendCode}
                disabled={emailLoading || exchangeMutation.isPending || !email}
              >
                {emailLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Send Code"
                )}
              </Button>
            )}
          </div>

          {otpSent && (
            <div className="space-y-2">
              {/* 6-digit OTP, shadcn InputOTP requires setup; using plain inputs for portability */}
              <Label htmlFor="privy-otp">6-digit code</Label>
              <div className="flex gap-2">
                <Input
                  id="privy-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="flex-1 tracking-widest text-center font-mono"
                />
                <Button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={
                    emailLoading || exchangeMutation.isPending || otp.length < 6
                  }
                  className="text-amber-400 bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/20"
                  variant="ghost"
                >
                  {emailLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* ── Wallet login ──────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <Button
            type="button"
            onClick={handleWalletLogin}
            disabled={walletLoading || exchangeMutation.isPending}
            className={[
              "w-full font-semibold",
              "text-amber-400 bg-amber-400/10 border border-amber-400/30",
              "hover:bg-amber-400/20 hover:border-amber-400/50 transition-colors",
            ].join(" ")}
            variant="ghost"
          >
            {(walletLoading || exchangeMutation.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Log in with wallet
          </Button>
        </div>

        {/* ── Status message ────────────────────────────────────────────── */}
        {activeMethod && status.message && (
          <p
            className={[
              "text-center text-xs",
              status.kind === "error" ? "text-destructive" : "text-teal-400",
            ].join(" ")}
          >
            {status.message}
          </p>
        )}

        {/* ── Mode switcher ─────────────────────────────────────────────── */}
        {onSwitchToCandidate && (
          <p className="text-center text-xs text-muted-foreground">
            Not an employer?{" "}
            <button
              type="button"
              onClick={onSwitchToCandidate}
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Switch to candidate <ArrowUpRight className="h-3 w-3" />
            </button>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
