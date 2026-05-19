'use client'

import React from 'react'
import Link from 'next/link'
import {
  MapPin,
  ShieldCheck,
  BadgeCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/lib/auth-store'
import { type Job } from '@/components/jobs/JobCard'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

// ---------------------------------------------------------------------------
// Extended Job type for sheet detail
// ---------------------------------------------------------------------------

export type JobDetail = Job & {
  description?: string
  requirements?: Array<{
    label: string
    type?: string        // e.g. 'must-have' | 'nice-to-have'
    required?: boolean
  }>
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JobDetailSheetProps {
  job?: JobDetail | null
  jobId: string | null
  open: boolean
  onClose: () => void
  hasScorecard: boolean
  isApplied: boolean
  onApply: () => void
  isApplying: boolean
  gapData?: {
    matched: string[]
    missing: string[]
    fitScore: number
  }
  gapLoading: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSalaryLabel(job: Job): string | null {
  const { salaryMin: min, salaryMax: max, currency = 'USD' } = job
  if (!min && !max) return null
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)
  if (min && max) return `${symbol}${fmt(min)} – ${symbol}${fmt(max)}`
  if (min) return `${symbol}${fmt(min)}+`
  return `Up to ${symbol}${fmt(max!)}`
}

function FitScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score)
  const color =
    pct >= 75
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
      : pct >= 50
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
      : 'border-rose-500/40 bg-rose-500/10 text-rose-400'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg border px-2.5 py-0.5 text-sm font-semibold tabular-nums',
        color,
      )}
    >
      {pct}% fit
    </span>
  )
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

function GapAnalysisSection({
  hasScorecard,
  gapLoading,
  gapData,
}: Pick<JobDetailSheetProps, 'hasScorecard' | 'gapLoading' | 'gapData'>) {
  if (!hasScorecard) {
    return (
      <div className="rounded-xl border border-border bg-[#1A2338] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">No scorecard yet</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Generate your scorecard to see how well you match this role.
            </p>
            <Link
              href="/profile"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Go to profile
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (gapLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-24 rounded-lg bg-muted/30" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full bg-muted/30" />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full bg-muted/30" />
          ))}
        </div>
      </div>
    )
  }

  if (!gapData) return null
const matched = gapData?.matched ?? [];
const missing = gapData?.missing ?? [];

return (
    <div className="space-y-4">
      {/* Fit score */}
      <div className="flex items-center gap-2">
        <FitScoreBadge score={gapData.fitScore} />
        <span className="text-xs text-muted-foreground">overall match</span>
      </div>

      {/* Matched skills */}
      {matched.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-emerald-500/80">
            <CheckCircle2 className="h-3 w-3" />
            Matched
          </div>
          <div className="flex flex-wrap gap-1.5">
            {matched.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missing skills */}
      {missing.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-rose-500/80">
            <XCircle className="h-3 w-3" />
            Gaps
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-400"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function JobDetailSheet({
  job,
  open,
  onClose,
  hasScorecard,
  isApplied,
  onApply,
  isApplying,
  gapData,
  gapLoading,
}: JobDetailSheetProps) {
  const salary = job ? formatSalaryLabel(job) : null
  const isVerified = job?.isEscrowFunded && job?.isVerifiedPayer

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col gap-0 p-0 bg-[#111827] border-border"
      >
        <VisuallyHidden>
    <SheetTitle>Job Details</SheetTitle>
  </VisuallyHidden>
        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* ── 1. Header ─────────────────────────────────────────────── */}
          <SheetHeader className="border-b border-border px-6 pb-5 pt-6">
            {/* Title */}
            <SheetTitle className="pr-8 text-xl font-semibold leading-snug text-foreground">
              {job?.title ?? <Skeleton className="h-6 w-3/4 bg-muted/30" />}
            </SheetTitle>

            {/* Company + location row */}
            {job && (
              <SheetDescription asChild>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">{job.company}</span>
                    {isVerified && (
                      <span className="flex items-center gap-0.5 rounded-md border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-medium text-teal-400">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        Verified
                      </span>
                    )}
                  </div>

                  {(job.location || job.remoteType) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[job.location, job.remoteType]
                        .filter(Boolean)
                        .map((s) => s!.charAt(0).toUpperCase() + s!.slice(1))
                        .join(' · ')}
                    </div>
                  )}
                </div>
              </SheetDescription>
            )}

            {/* Salary + meta badges */}
            {job && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {salary && (
                  <Badge className="rounded-lg border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {salary}
                  </Badge>
                )}
                {job.roleType && (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-border bg-transparent px-2 py-0.5 text-[11px] capitalize text-muted-foreground"
                  >
                    {job.roleType.replace('-', ' ')}
                  </Badge>
                )}
                {job.seniority && (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-border bg-transparent px-2 py-0.5 text-[11px] capitalize text-muted-foreground"
                  >
                    {job.seniority}
                  </Badge>
                )}
                {job.isWeb3 && (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-400"
                  >
                    Web3
                  </Badge>
                )}
                {job.isEscrowFunded && (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400"
                  >
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Fund secured
                  </Badge>
                )}
                {job.isVerifiedPayer && (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-400"
                  >
                    <BadgeCheck className="mr-1 h-3 w-3" />
                    Verified employer
                  </Badge>
                )}
              </div>
            )}
          </SheetHeader>

          {/* ── Content sections ──────────────────────────────────────── */}
          <div className="divide-y divide-border/60">

            {/* ── 2. Description ──────────────────────────────────────── */}
            {job?.description && (
              <section className="px-6 py-5">
                <SectionHeading>About this role</SectionHeading>
                <div className="prose prose-sm prose-invert max-w-none">
                  <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                    {job.description}
                  </p>
                </div>
              </section>
            )}

            {/* ── 3. Tech stack ───────────────────────────────────────── */}
            {job?.techStack && job.techStack.length > 0 && (
              <section className="px-6 py-5">
                <SectionHeading>Tech stack</SectionHeading>
                <div className="flex flex-wrap gap-1.5">
                  {job.techStack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md border border-border bg-[#1A2338] px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* ── 4. Requirements ─────────────────────────────────────── */}
            {job?.requirements && job.requirements.length > 0 && (
              <section className="px-6 py-5">
                <SectionHeading>Requirements</SectionHeading>
                <ul className="space-y-2">
                  {job.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                      <span className="flex-1 text-sm text-foreground/80 leading-snug">
                        {req.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {req.type && (
                          <Badge
                            variant="outline"
                            className="rounded px-1.5 py-0 text-[10px] border-border text-muted-foreground"
                          >
                            {req.type}
                          </Badge>
                        )}
                        {req.required === true && (
                          <Badge
                            variant="outline"
                            className="rounded px-1.5 py-0 text-[10px] border-rose-500/30 bg-rose-500/10 text-rose-400"
                          >
                            required
                          </Badge>
                        )}
                        {req.required === false && (
                          <Badge
                            variant="outline"
                            className="rounded px-1.5 py-0 text-[10px] border-border text-muted-foreground"
                          >
                            optional
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── 5. Gap analysis ─────────────────────────────────────── */}
            <section className="px-6 py-5">
              <div className="mb-3 flex items-center justify-between">
                <SectionHeading>Your fit</SectionHeading>
              </div>
              <GapAnalysisSection
                hasScorecard={hasScorecard}
                gapLoading={gapLoading}
                gapData={gapData}
              />
            </section>

          </div>
        </div>

        {/* ── Sticky apply footer ─────────────────────────────────────── */}
        <div className="sticky bottom-0 z-10 border-t border-border bg-[#111827] p-4">
          {!useAuthStore.getState().token ? (
            <div className="space-y-2">
              <Button
                asChild
                className="w-full rounded-xl font-medium"
              >
                <Link href="/auth">Log in to apply</Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                You must be logged in as a candidate to apply.
              </p>
            </div>
          ) : useAuthStore.getState().role === 'employer' ? (
            <div className="space-y-2">
              <Button
                className="w-full rounded-xl font-medium"
                disabled
              >
                Candidates only
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Employer accounts cannot apply to jobs.
              </p>
            </div>
          ) : isApplied ? (
            <Button
              id="job-detail-apply-btn"
              className="w-full cursor-default rounded-xl border border-emerald-500/30 bg-emerald-500/10 font-medium text-emerald-400 hover:bg-emerald-500/10"
              disabled
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Applied
            </Button>
          ) : !hasScorecard ? (
            <div className="space-y-2">
              <Button
                id="job-detail-apply-btn"
                className="w-full rounded-xl"
                disabled
              >
                Apply now
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                You need a{' '}
                <Link href="/profile" className="font-medium text-primary hover:underline">
                  scorecard
                </Link>{' '}
                to apply to jobs.
              </p>
            </div>
          ) : (
            <Button
              id="job-detail-apply-btn"
              onClick={onApply}
              disabled={isApplying}
              className="w-full rounded-xl font-medium"
            >
              {isApplying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                'Apply now'
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
