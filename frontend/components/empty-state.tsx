"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateFeature {
  icon: LucideIcon;
  text: string;
}

interface EmptyStateAction {
  label: string;
  route: string;
}

interface EmptyStateProps {
  /** Icon shown in the center circle */
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /**
   * "hero"   – full-width onboarding card with gradient bg, feature bullets, larger icon.
   *            Use for the very first thing a new user sees (Dashboard).
   * "card"   – compact dashed-border card. Use inside page sections.
   * "inline" – minimal, no card wrapper. Use inside table rows or small containers.
   */
  variant?: "hero" | "card" | "inline";
  /** Optional feature bullets for the hero variant */
  features?: EmptyStateFeature[];
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  variant = "card",
  features,
}: EmptyStateProps) {
  /* ─── HERO ─────────────────────────────────────────────── */
  if (variant === "hero") {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl border border-violet-100 dark:border-violet-900/40 bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-violet-950/30 dark:via-slate-900 dark:to-indigo-950/20 p-10 md:p-14 shadow-sm">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-violet-200/30 blur-3xl dark:bg-violet-700/10" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-700/10" />

        <div className="relative z-10 flex flex-col items-start gap-8 lg:flex-row lg:items-center">
          {/* Left: icon + text */}
          <div className="flex-1 space-y-5">
            <div className="inline-flex rounded-xl bg-violet-100 dark:bg-violet-900/40 p-4">
              <Icon className="h-10 w-10 text-violet-600 dark:text-violet-400" />
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">
                {title}
              </h2>
              <p className="mt-2 max-w-xl text-slate-500 dark:text-slate-400 leading-relaxed">
                {description}
              </p>
            </div>

            {features && features.length > 0 && (
              <ul className="space-y-2.5">
                {features.map((f, i) => {
                  const FIcon = f.icon;
                  return (
                    <li key={i} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <span className="flex-shrink-0 rounded-full bg-violet-100 dark:bg-violet-900/40 p-1.5">
                        <FIcon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                      </span>
                      {f.text}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg" className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                <Link href={primaryAction.route}>
                  {primaryAction.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              {secondaryAction && (
                <Button asChild variant="outline" size="lg">
                  <Link href={secondaryAction.route}>{secondaryAction.label}</Link>
                </Button>
              )}
            </div>
          </div>

          {/* Right: decorative step-flow */}
          <div className="hidden lg:flex flex-shrink-0 flex-col gap-3 w-56">
            {["Post a job", "Fund escrow", "Review work", "Hire with proof"].map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-violet-100 dark:border-violet-900/50 bg-white/70 dark:bg-white/5 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 backdrop-blur-sm"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/50 text-xs font-bold text-violet-700 dark:text-violet-300">
                  {i + 1}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ─── INLINE ────────────────────────────────────────────── */
  if (variant === "inline") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4">
          <Icon className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        </div>
        <div>
          <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link href={primaryAction.route}>{primaryAction.label}</Link>
          </Button>
          {secondaryAction && (
            <Button asChild variant="outline" size="sm">
              <Link href={secondaryAction.route}>{secondaryAction.label}</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  /* ─── CARD (default) ────────────────────────────────────── */
  return (
    <div className={cn("flex w-full items-center justify-center p-8")}>
      <Card className="w-full max-w-md border-dashed shadow-sm">
        <CardContent className="flex flex-col items-center justify-center p-10 text-center">
          <div className="mb-6 rounded-full bg-violet-100 p-4 dark:bg-violet-900/30">
            <Icon className="h-8 w-8 text-violet-600 dark:text-violet-400" />
          </div>
          <h2 className="mb-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h2>
          <p className="mb-8 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {description}
          </p>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild className="w-full sm:w-auto gap-1.5">
              <Link href={primaryAction.route}>
                {primaryAction.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {secondaryAction && (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href={secondaryAction.route}>{secondaryAction.label}</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
