'use client'

import React from 'react'
import { MapPin, Calendar, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Job type
// ---------------------------------------------------------------------------

export type Job = {
  id: string
  title: string
  company: {
  name: string
  logoUrl?: string | null
  website?: string
  isVerifiedPayer?: boolean
}
  location?: string
  remoteType?: string
  salaryMin?: number
  salaryMax?: number
  currency?: string
  postedAt?: string | Date
  techStack?: string[]
  roleType?: string
  seniority?: string
  isEscrowFunded?: boolean
  isVerifiedPayer?: boolean
  isWeb3?: boolean
}

interface JobCardProps {
  job: Job
  isApplied: boolean
  isSelected: boolean
  onClick: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSalary(min?: number, max?: number, currency = 'USD'): string | null {
  if (!min && !max) return null
  const fmt = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency
  if (min && max) return `${symbol}${fmt(min)} – ${symbol}${fmt(max)}`
  if (min) return `${symbol}${fmt(min)}+`
  return `Up to ${symbol}${fmt(max!)}`
}

function formatPostedDate(date?: string | Date): string | null {
  if (!date) return null
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return null
  const diffMs = Date.now() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

// ---------------------------------------------------------------------------
// JobCard
// ---------------------------------------------------------------------------

export function JobCard({ job, isApplied, isSelected, onClick }: JobCardProps) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency)
  const postedLabel = formatPostedDate(job.postedAt)
  const isVerified =
  job.isEscrowFunded && job.company?.isVerifiedPayer

  return (
    <Card
      onClick={onClick}
      className={cn(
        'relative cursor-pointer select-none overflow-hidden rounded-2xl border bg-[#151C2E] p-0 shadow-sm transition-colors duration-150',
        'hover:border-primary/60',
        isSelected && 'ring-1 ring-primary border-primary/60',
      )}
    >
      {/* Applied badge */}
      {isApplied && (
        <div className="absolute right-3 top-3 z-10">
          <Badge
            className="rounded-md border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
            variant="outline"
          >
            Applied
          </Badge>
        </div>
      )}

      <CardContent className="p-5">
        {/* Title */}
        <p className="pr-16 text-sm font-medium leading-snug text-foreground">
          {job.title}
        </p>

        {/* Company + location row */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">{job.company?.name}</span>

            {/* Verified badge next to company name */}
            {isVerified && (
              <span className="flex items-center gap-0.5 rounded-md border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-medium text-teal-400">
                <ShieldCheck className="h-2.5 w-2.5" />
                Verified
              </span>
            )}
          </div>

          {(job.location || job.remoteType) && (
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span>
                {[job.location, job.remoteType]
                  .filter(Boolean)
                  .map((s) => s!.charAt(0).toUpperCase() + s!.slice(1))
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>

        {/* Salary + date */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {salary ? (
            <span className="text-xs font-medium text-foreground/80">{salary}</span>
          ) : (
            <span className="text-xs text-muted-foreground/60">Salary not listed</span>
          )}

          {postedLabel && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {postedLabel}
            </div>
          )}
        </div>

        {/* Tech stack chips */}
        {job.techStack && job.techStack.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.techStack.slice(0, 5).map((tech) => (
              <span
                key={tech}
                className="rounded-md border border-border bg-[#1A2338] px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {tech}
              </span>
            ))}
            {job.techStack.length > 5 && (
              <span className="rounded-md border border-border bg-[#1A2338] px-2 py-0.5 text-[11px] text-muted-foreground">
                +{job.techStack.length - 5}
              </span>
            )}
          </div>
        )}

        {/* Meta badges row */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.roleType && (
            <Badge
              variant="outline"
              className="rounded-md border-border bg-transparent px-2 py-0.5 text-[10px] capitalize text-muted-foreground"
            >
              {job.roleType.replace('-', ' ')}
            </Badge>
          )}
          {job.seniority && (
            <Badge
              variant="outline"
              className="rounded-md border-border bg-transparent px-2 py-0.5 text-[10px] capitalize text-muted-foreground"
            >
              {job.seniority}
            </Badge>
          )}
          {job.isWeb3 && (
            <Badge
              variant="outline"
              className="rounded-md border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400"
            >
              Web3
            </Badge>
          )}
          {job.isEscrowFunded && (
            <Badge
              variant="outline"
              className="rounded-md border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400"
            >
              Deposit
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------

export function JobCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-[#151C2E] p-5">
      <div className="mb-2 h-4 w-3/4 rounded-md bg-muted/40" />
      <div className="mb-4 h-3 w-1/2 rounded-md bg-muted/30" />
      <div className="mb-3 h-3 w-1/3 rounded-md bg-muted/30" />
      <div className="flex gap-1.5">
        <div className="h-5 w-12 rounded-md bg-muted/20" />
        <div className="h-5 w-16 rounded-md bg-muted/20" />
        <div className="h-5 w-10 rounded-md bg-muted/20" />
      </div>
    </div>
  )
}
