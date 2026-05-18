"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailVerifyModalProps {
  open: boolean;
  onVerify: (code: string) => void;
  onResend: () => void;
  isVerifying?: boolean;
  isResending?: boolean;
  error?: string | null;
}

const RESEND_SECONDS = 30;

// ─── EmailVerifyModal ─────────────────────────────────────────────────────────

export function EmailVerifyModal({
  open,
  onVerify,
  onResend,
  isVerifying = false,
  isResending = false,
  error,
}: EmailVerifyModalProps) {
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start countdown on mount / when modal opens
  useEffect(() => {
    if (!open) return;
    setCountdown(RESEND_SECONDS);

    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open]);

  function handleResend() {
    if (countdown > 0) return;
    onResend();
    setCountdown(RESEND_SECONDS);
    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function handleVerify() {
    onVerify(otp);
  }

  return (
    <Dialog open={open}>
      {/* No close button, must complete verification */}
      <DialogContent
        className="sm:max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Check your inbox</DialogTitle>
          <DialogDescription>
            Enter the 6-digit code we sent to your email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* OTP input */}
          <div className="space-y-1">
            <Label htmlFor="email-otp">Verification code</Label>
            <Input
              id="email-otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="tracking-widest text-center font-mono text-lg"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Submit */}
          <Button
            type="button"
            className="w-full"
            disabled={isVerifying || otp.length < 6}
            onClick={handleVerify}
          >
            {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify email
          </Button>

          {/* Resend */}
          <p className="text-center text-xs text-muted-foreground">
            {countdown > 0 ? (
              <span>Resend in {countdown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {isResending ? "Sending..." : "Resend code"}
              </button>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
