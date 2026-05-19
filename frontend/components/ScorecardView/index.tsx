'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Code2,
  Wallet,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Zap,
  AlertTriangle,
  Info,
  BarChart3,
  FolderGit2,
  Trophy,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScorecardData {
  profile?: {
    username?: string
    avatarUrl?: string
    primaryCohort?: string
    seniority?: string
    summary?: string
  }
  score?: {
    value?: number
    percentile?: number
    isWithheld?: {
      value?: boolean
      reason?: string
    }
  }
  trust?: {
    level?: string
    risk?: string
    label?: string
    guidance?: string
  }
  insights?: {
    capabilities?: Array<{
      label: string
      score: number
    }>
    highlights?: string[]
    gaps?: string[]
    caveats?: string[]
    ownership?: {
      ownedProjects?: number
      activelyMaintained?: number
      confidence?: number
    }
    impact?: {
      activityLevel?: string
      consistency?: number
      externalContributions?: number
      confidence?: number
    }
    reputation?: any
    interactionProfile?: any
    stack?: {
      languages?: string[]
      tools?: string[]
    }
    web3?: {
      achievements?: Array<{
        label: string
        description?: string
      }>
    }
  }
  raw?: unknown
  generatedAt?: string
}

export interface ScorecardViewProps {
  scorecard: ScorecardData
  /** When true: hides raw toggle, hides regenerate button */
  isPublic?: boolean
  onRegenerate?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10 border-emerald-500/20'
  if (score >= 60) return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-red-500/10 border-red-500/20'
}

function capabilityBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

function trustColor(level: string): string {
  const l = level?.toLowerCase()
  if (l === 'high' || l === 'verified') return 'text-emerald-400'
  if (l === 'medium') return 'text-amber-400'
  return 'text-red-400'
}

/** How many characters of summary to show before "Show more" */
const SUMMARY_TRUNCATE = 280

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children, icon: Icon }: { children: React.ReactNode, icon?: any }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </p>
  )
}

function CapabilityBar({
  label,
  score,
  delay,
}: {
  label: string
  score: number
  delay: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/90">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${scoreColor(score)}`}>
          {score}
        </span>
      </div>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted/40">
        <motion.div
          className={`absolute left-0 top-0 h-full rounded-full ${capabilityBarColor(score)}`}
          initial={{ width: '0%' }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
        />
      </div>
    </div>
  )
}

function MetricItem({ label, value, icon: Icon, confidence }: { label: string, value: string | number, icon: any, confidence?: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/40 bg-muted/5 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-foreground">{value}</span>
        {confidence !== undefined && (
          <span className="text-[10px] text-muted-foreground/60">
            {Math.round(confidence * 100)}% conf
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ScorecardView({
  scorecard,
  isPublic = false,
  onRegenerate,
}: ScorecardViewProps) {
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [rawOpen, setRawOpen] = useState(false)

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.08,
    },
  },
}

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 18,
    filter: 'blur(4px)',
  },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

  const {
    profile = {},
    score = {},
    trust = {},
    insights = {},
    raw,
    generatedAt,
  } = scorecard || {}

  const {
    capabilities = [],
    highlights = [],
    gaps = [],
    caveats = [],
    stack = {},
    ownership = {},
    impact = {},
    web3 = {},
  } = insights || {}

  const overallScore = score.value ?? 0
  const summary = profile.summary ?? ''
  const summaryIsTruncatable = summary.length > SUMMARY_TRUNCATE
  const displayedSummary =
    summaryExpanded || !summaryIsTruncatable
      ? summary
      : `${summary.slice(0, SUMMARY_TRUNCATE).trimEnd()}…`

  const mergedStack = [
    ...(stack.languages ?? []),
    ...(stack.tools ?? []),
  ]

  const achievements = web3?.achievements ?? []
  // console.log("profile: ", profile);
 return (
  <motion.div
    variants={containerVariants}
    initial="hidden"
    animate="show"
  >
    <Card className="w-full overflow-hidden border-border/40 bg-card/50 backdrop-blur-sm">
      {/* ── HEADER: Identity & Composite Score ──────────────── */}
      <motion.div variants={itemVariants}>
      <CardHeader className="space-y-0 border-b border-border/40 p-0">
        <div className="flex flex-col md:flex-row md:items-stretch">
          {/* Identity Info */}
          <div className="flex-1 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center border border-border/60 overflow-hidden">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.username} className="h-full w-full object-cover" />
                ) : (
                  <div className="text-lg font-bold text-muted-foreground uppercase">
                    {(profile.username ?? 'U').charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {profile.username ?? 'Anonymous Candidate'}
                </h2>
              </div>
            </div>
            {/* Metrics Snapshot */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricItem 
                label="Owned Projects" 
                value={ownership.ownedProjects ?? 0} 
                icon={FolderGit2}
                confidence={ownership.confidence}
              />
              <MetricItem 
                label="Active Maint." 
                value={ownership.activelyMaintained ?? 0} 
                icon={RefreshCw}
              />
              <MetricItem 
                label="Activity Level" 
                value={impact.activityLevel ?? 'Low'} 
                icon={BarChart3}
                confidence={impact.confidence}
              />
              <MetricItem 
                label="Consistency" 
                value={`${Math.round((impact.consistency ?? 0) * 100)}%`} 
                icon={Zap}
              />
            </div>
          </div>

          {/* Large Score Display */}
          <div className={`w-full md:w-48 flex flex-col items-center justify-center p-6 border-t md:border-t-0 md:border-l border-border/40 ${scoreBg(overallScore)}`}>
            {score.isWithheld?.value ? (
              <div className="text-center">
                <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Score Withheld
                </span>
                <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                  {score.isWithheld.reason ?? 'Insufficient data'}
                </span>
              </div>
            ) : (
              <div className="text-center">
                <div className="relative inline-block">
                  <span className={`text-6xl font-black tabular-nums leading-none tracking-tighter ${scoreColor(overallScore)}`}>
                    {overallScore}
                  </span>
                  {score.percentile !== undefined && (
                    <div className="absolute -right-2 -top-1 bg-background border border-border/60 rounded-full px-1.5 py-0.5 shadow-sm">
                      <span className="text-[9px] font-bold text-muted-foreground">
                        p{score.percentile}
                      </span>
                    </div>
                  )}
                </div>
                <span className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 block">
                  System Score
                </span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
</motion.div>
<motion.div variants={itemVariants}>

      <CardContent className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
        {/* Left Column: Summary & Insights */}
        <div className="lg:col-span-7 space-y-8">
          {/* Summary Section */}
          <section>
            <SectionLabel>Professional Summary</SectionLabel>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {displayedSummary || 'No summary available for this profile.'}
            </p>
            {summaryIsTruncatable && (
              <button
                onClick={() => setSummaryExpanded((v) => !v)}
                className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
              >
                {summaryExpanded ? (
                  <>Show less <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>Show more <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </section>

          {/* Highlights & Gaps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Highlights */}
            <section>
              <SectionLabel icon={Zap}>Core Strengths</SectionLabel>
              {highlights.length > 0 ? (
                <ul className="space-y-2">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500/70" />
                      {h}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic">No highlights identified.</p>
              )}
            </section>

            {/* Gaps/Caveats */}
            <section>
              <SectionLabel icon={AlertTriangle}>Areas for Review</SectionLabel>
              <div className="space-y-4">
                {gaps.length > 0 && (
                  <ul className="space-y-2">
                    {gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/70" />
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
                {caveats.length > 0 && (
                  <ul className="space-y-2">
                    {caveats.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground/80">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
                {gaps.length === 0 && caveats.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No gaps or caveats identified.</p>
                )}
              </div>
            </section>
          </div>

          {/* Stack Fingerprint */}
          <section>
            <SectionLabel icon={Code2}>Stack Fingerprint</SectionLabel>
            {mergedStack.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {mergedStack.map((tech) => (
                  <span
                    key={tech}
                    className="inline-flex items-center rounded bg-muted/50 border border-border/40 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No stack data identified.</p>
            )}
          </section>
        </div>

        {/* Right Column: Trust, Capabilities & Web3 */}
        <div className="lg:col-span-5 space-y-8">
          {/* Trust Assessment */}
          <section className="rounded-xl border border-border/40 bg-muted/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel icon={ShieldCheck}>Trust Assessment</SectionLabel>
              <Badge variant="outline" className={`text-[9px] uppercase tracking-tighter ${trustColor(trust.level ?? '')}`}>
                {trust.level ?? 'Unverified'}
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  {trust.label ?? 'Standard Risk Profile'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {trust.guidance ?? 'Trust level is based on cross-referenced data points from verified sources.'}
              </p>
            </div>
          </section>

          {/* Capability breakdown */}
          <section>
            <SectionLabel icon={Trophy}>Capabilities</SectionLabel>
            {capabilities.length > 0 ? (
              <div className="flex flex-col gap-4">
                {capabilities.map((cap, i) => (
                  <CapabilityBar
                    key={cap.label}
                    label={cap.label}
                    score={cap.score}
                    delay={i * 0.08}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No capability data available.</p>
            )}
          </section>

          {/* Web3 Achievements */}
          <section>
            <SectionLabel icon={Wallet}>Web3 Activity</SectionLabel>
            {achievements.length === 0 ? (
              <p className="text-xs text-muted-foreground leading-relaxed italic">
                {web3 == null
                  ? 'No wallet linked, connect a Solana wallet to surface on-chain activity.'
                  : 'No on-chain achievements found for this wallet.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {achievements.map((ach, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-border/20 bg-muted/5 p-2.5">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground/90 leading-none">
                        {ach.label}
                      </p>
                      {ach.description && (
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-tight">
                          {ach.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </CardContent>
</motion.div>
<motion.div variants={itemVariants}>

      {/* ── FOOTER: Metadata & Admin Actions ────────────────── */}
      <CardHeader className="border-t border-border/40 bg-muted/5 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {generatedAt && (
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Analysis generated {new Date(generatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
            {!isPublic && raw !== undefined && (
              <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-foreground">
                    Raw Data {rawOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </CollapsibleTrigger>
              </Collapsible>
            )}
          </div>

          {!isPublic && onRegenerate && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              className="h-8 text-[11px] font-bold uppercase tracking-wider border-destructive/20 text-destructive/80 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/40"
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              Regenerate
            </Button>
          )}
        </div>

        {!isPublic && raw !== undefined && (
          <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
            <CollapsibleContent>
              <pre className="mt-4 max-h-72 overflow-auto rounded-lg border border-border/40 bg-background/50 p-4 text-[10px] font-mono leading-relaxed text-muted-foreground/80">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardHeader>
      </motion.div>
<motion.div variants={itemVariants}></motion.div>
        </Card>
  </motion.div>
)
}

export default ScorecardView
