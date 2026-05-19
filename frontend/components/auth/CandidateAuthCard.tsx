"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Github, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";

import {
  getApiErrorMessage,
  getEmailVerificationRequiredBody,
  getGithubAuthUrl,
  getGoogleAuthUrl,
  getMfaRequiredBody,
  loginCandidate,
  registerCandidate,
  type CandidateRegisterInput,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { PasswordResetView } from "@/components/auth/PasswordResetView";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── Types ────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const registerSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be at most 20 characters.")
    .regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers."),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

interface CandidateAuthCardProps {
  onLoginSuccess?: () => void;
  onRegisterSuccess: (data: CandidateRegisterInput) => void;
  onForgotPassword?: () => void;
  onMfaRequired: (payload: { token: string; userId?: string }) => void;
  onEmailVerificationRequired?: (email?: string) => void;
  passwordResetStep?: 1 | 2 | null;
  onPasswordResetBack?: () => void;
  onPasswordResetSuccess?: () => void;
}

// ─── Google icon (inline SVG, no extra dep) ──────────────────────────────────

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// ─── Shared OAuth block ───────────────────────────────────────────────────────

function OAuthBlock() {
  const loginGithub = useMutation({
    mutationFn: getGithubAuthUrl,
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const loginGoogle = useMutation({
    mutationFn: getGoogleAuthUrl,
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const oauthError = loginGithub.error ?? loginGoogle.error;

  return (
    <div className="space-y-2">
      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        variant="ghost"
        className="w-full border border-border"
        type="button"
        disabled={loginGithub.isPending}
        onClick={() => loginGithub.mutate()}
      >
        <Github className="mr-2 h-4 w-4" />
        Continue with GitHub
      </Button>

      <Button
        variant="ghost"
        className="w-full border border-border"
        type="button"
        disabled={loginGoogle.isPending}
        onClick={() => loginGoogle.mutate()}
      >
        <GoogleIcon />
        <span className="ml-2">Continue with Google</span>
      </Button>

      {oauthError && (
        <p className="text-xs text-destructive">
          {getApiErrorMessage(oauthError)}
        </p>
      )}
    </div>
  );
}

// ─── Login tab ────────────────────────────────────────────────────────────────

function LoginTab({
  onForgotPassword,
  onLoginSuccess,
  onMfaRequired,
  onEmailVerificationRequired,
}: {
  onForgotPassword: () => void;
  onLoginSuccess?: () => void;
  onMfaRequired: (payload: { token: string; userId?: string }) => void;
  onEmailVerificationRequired?: (email?: string) => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: loginCandidate,
    onSuccess: (data) => {
      useAuthStore.getState().setAuth({ token: data.token, role: "candidate" });
      onLoginSuccess?.();
      router.push("/profile");
    },
    onError: (err) => {
      const verification = getEmailVerificationRequiredBody(err);
      if (verification) {
        onEmailVerificationRequired?.(verification.email);
        return;
      }

      const mfa = getMfaRequiredBody(err);
      const token = mfa?.token ?? mfa?.mfaToken;
      if (mfa && token) {
        onMfaRequired({ token, userId: mfa.userId });
        return;
      }

      setError("root", { message: getApiErrorMessage(err) });
    },
  });

  const onSubmit = handleSubmit((data) => loginMutation.mutate(data));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Email */}
      <div className="space-y-1">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          placeholder="Email"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          placeholder="Password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs text-muted-foreground"
            onClick={onForgotPassword}
          >
            Forgot password?
          </Button>
        </div>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        disabled={loginMutation.isPending}
      >
        {loginMutation.isPending && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Log in
      </Button>

      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <OAuthBlock />
    </form>
  );
}

// ─── Register tab ─────────────────────────────────────────────────────────────

function RegisterTab({
  onRegisterSuccess,
}: {
  onRegisterSuccess: (data: CandidateRegisterInput) => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const registerMutation = useMutation({
    mutationFn: registerCandidate,
    onSuccess: (_result, variables) => {
      onRegisterSuccess(variables);
    },
    onError: (err) => {
      setError("root", { message: getApiErrorMessage(err) });
    },
  });

  const onSubmit = handleSubmit((data) => registerMutation.mutate(data));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Email */}
      <div className="space-y-1">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          placeholder="Email"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          type="password"
          placeholder="Password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      {/* Username */}
      <div className="space-y-1">
        <Label htmlFor="register-username">Username</Label>
        <Input
          id="register-username"
          type="text"
          placeholder="Username"
          {...register("username")}
        />
        {errors.username && (
          <p className="text-xs text-destructive">{errors.username.message}</p>
        )}
      </div>

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        disabled={registerMutation.isPending}
      >
        {registerMutation.isPending && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Create account
      </Button>

      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <OAuthBlock />
    </form>
  );
}

// ─── CandidateAuthCard ────────────────────────────────────────────────────────

export function CandidateAuthCard({
  onLoginSuccess,
  onRegisterSuccess,
  onForgotPassword,
  onMfaRequired,
  onEmailVerificationRequired,
  passwordResetStep,
  onPasswordResetBack,
  onPasswordResetSuccess,
}: CandidateAuthCardProps) {
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const activeResetStep = passwordResetStep ?? (showPasswordReset ? 1 : null);

  function handleForgotPassword() {
    setShowPasswordReset(true);
    onForgotPassword?.();
  }

  function handlePasswordResetBack() {
    setShowPasswordReset(false);
    onPasswordResetBack?.();
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Log in or create your candidate account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {activeResetStep ? (
          <PasswordResetView
            step={activeResetStep}
            onBack={handlePasswordResetBack}
            onSuccess={onPasswordResetSuccess ?? handlePasswordResetBack}
          />
        ) : (
          <Tabs defaultValue="login">
            <TabsList className="w-full mb-6">
              <TabsTrigger value="login" className="flex-1">
                Log in
              </TabsTrigger>
              <TabsTrigger value="register" className="flex-1">
                Sign up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <LoginTab
                onForgotPassword={handleForgotPassword}
                onLoginSuccess={onLoginSuccess}
                onMfaRequired={onMfaRequired}
                onEmailVerificationRequired={onEmailVerificationRequired}
              />
            </TabsContent>

            <TabsContent value="register">
              <RegisterTab onRegisterSuccess={onRegisterSuccess} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
