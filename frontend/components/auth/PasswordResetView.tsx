"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";

import { confirmPasswordReset, requestPasswordReset } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PasswordResetViewProps {
  step: 1 | 2;
  onBack: () => void;
  onSuccess: () => void;
}

const step1Schema = z.object({
  email: z.string().email("Enter a valid email."),
});

const step2Schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;

// ─── Framer Motion variants ───────────────────────────────────────────────────

const stepVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
  });

  const requestMutation = useMutation({
    mutationFn: (data: Step1Values) =>
      requestPasswordReset({ email: data.email }),
    onSuccess: () => {
      setSent(true);
    },
    onError: () => {
      setSent(true);
    },
  });

  const onSubmit = handleSubmit((data) => requestMutation.mutate(data));

  return (
    <div className="space-y-4">
      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to login
      </button>

      {/* Heading */}
      <div className="space-y-1">
        <p className="text-base font-medium">Reset your password</p>
        <p className="text-sm text-muted-foreground">
          Enter your email and we'll send a link.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="success"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-3 py-4 text-center"
          >
            <CheckCircle2 className="h-8 w-8 text-teal-400" />
            <p className="text-sm font-medium">Check your inbox.</p>
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              ← Back to login
            </button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
            onSubmit={onSubmit}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="Email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={requestMutation.isPending}
            >
              {requestMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Send reset link
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function Step2({ onSuccess }: { onSuccess: () => void }) {
  const [done, setDone] = useState(false);
  const searchParams = useSearchParams();
  const token = searchParams.get("reset_token") ?? searchParams.get("token") ?? "";

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
  });

  const confirmMutation = useMutation({
    mutationFn: (data: Step2Values) =>
      confirmPasswordReset({ token, newPassword: data.password }),
    onSuccess: () => {
      setDone(true);
      toast({ title: "Password updated!" });
      onSuccess();
    },
    onError: () => {
      setError("root", {
        message: "Reset link may have expired. Request a new one.",
      });
    },
  });

  const onSubmit = handleSubmit((data) => confirmMutation.mutate(data));

  return (
    <div className="space-y-4">
      <p className="text-base font-medium">Set a new password</p>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-3 py-4 text-center"
          >
            <CheckCircle2 className="h-8 w-8 text-teal-400" />
            <p className="text-sm font-medium">Password updated!</p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
            onSubmit={onSubmit}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="New password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm password"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={confirmMutation.isPending || !token}
            >
              {confirmMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update password
            </Button>

            {errors.root?.message && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── PasswordResetView ────────────────────────────────────────────────────────

export function PasswordResetView({
  step,
  onBack,
  onSuccess,
}: PasswordResetViewProps) {
  return (
    <AnimatePresence mode="wait">
      {step === 1 ? (
        <motion.div
          key="step-1"
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.15 }}
        >
          <Step1 onBack={onBack} />
        </motion.div>
      ) : (
        <motion.div
          key="step-2"
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.15 }}
        >
          <Step2 onSuccess={onSuccess} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
