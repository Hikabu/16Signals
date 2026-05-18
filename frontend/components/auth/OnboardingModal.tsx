"use client";

import { useForm } from "react-hook-form";
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

interface OnboardingModalProps {
  open: boolean;
  defaultUsername?: string;
  onComplete: (data: OnboardingFormValues) => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export interface OnboardingFormValues {
  displayName: string;
  username: string;
  /** Kept for backwards-compatibility with auth/page.tsx — always "candidate" */
  role: "candidate" | "employer";
}

// ─── OnboardingModal ──────────────────────────────────────────────────────────

export function OnboardingModal({
  open,
  defaultUsername = "",
  onComplete,
  isSubmitting = false,
  error,
}: OnboardingModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    defaultValues: { username: defaultUsername, role: "candidate" },
  });

  const onSubmit = handleSubmit((data) => onComplete(data));

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Complete your profile</DialogTitle>
          <DialogDescription>
            Just a few details to get you started.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Display name */}
          <div className="space-y-1">
            <Label htmlFor="onboard-display">Display name</Label>
            <Input
              id="onboard-display"
              type="text"
              placeholder="Your name"
              {...register("displayName", {
                required: "Display name is required",
              })}
            />
            {errors.displayName && (
              <p className="text-xs text-destructive">
                {errors.displayName.message}
              </p>
            )}
          </div>

          {/* Username */}
          <div className="space-y-1">
            <Label htmlFor="onboard-username">Username</Label>
            <Input
              id="onboard-username"
              type="text"
              placeholder="username"
              {...register("username", { required: "Username is required" })}
            />
            {errors.username && (
              <p className="text-xs text-destructive">
                {errors.username.message}
              </p>
            )}
          </div>

          {/* role is a hidden field — always "candidate" for OAuth onboarding */}
          <input type="hidden" {...register("role")} value="candidate" />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete setup
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
