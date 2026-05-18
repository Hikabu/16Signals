"use client";

import { useState } from "react";
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

interface MfaModalProps {
  open: boolean;
  onVerify: (payload: { mode: MfaMode; code: string }) => void;
  isVerifying?: boolean;
  error?: string | null;
}

type MfaMode = "totp" | "recovery";

// ─── MfaModal ─────────────────────────────────────────────────────────────────

export function MfaModal({
  open,
  onVerify,
  isVerifying = false,
  error,
}: MfaModalProps) {
  const [mode, setMode] = useState<MfaMode>("totp");
  const [code, setCode] = useState("");

  function handleModeSwitch(next: MfaMode) {
    setMode(next);
    setCode("");
  }

  function handleVerify() {
    onVerify({ mode, code });
  }

  const isTotp = mode === "totp";
  const isReady = isTotp ? code.length === 6 : code.length === 8;

  return (
    <Dialog open={open}>
      {/* No close button, must complete MFA */}
      <DialogContent
        className="sm:max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {isTotp ? "Two-factor authentication" : "Recovery code"}
          </DialogTitle>
          <DialogDescription>
            {isTotp
              ? "Enter the 6-digit code from your authenticator app."
              : "Enter your 8-character recovery code."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Code input */}
          <div className="space-y-1">
            <Label htmlFor="mfa-code">
              {isTotp ? "Authentication code" : "Recovery code"}
            </Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode={isTotp ? "numeric" : "text"}
              maxLength={isTotp ? 6 : 8}
              placeholder={isTotp ? "000000" : "XXXXXXXX"}
              value={code}
              onChange={(e) =>
                setCode(
                  isTotp
                    ? e.target.value.replace(/\D/g, "")
                    : e.target.value.toUpperCase(),
                )
              }
              className="tracking-widest text-center font-mono text-lg"
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Submit */}
          <Button
            type="button"
            className="w-full"
            disabled={isVerifying || !isReady}
            onClick={handleVerify}
          >
            {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isTotp ? "Verify" : "Use recovery code"}
          </Button>

          {/* Toggle mode */}
          <p className="text-center text-xs text-muted-foreground">
            {isTotp ? (
              <button
                type="button"
                onClick={() => handleModeSwitch("recovery")}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Use recovery code
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleModeSwitch("totp")}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Use authenticator code
              </button>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
