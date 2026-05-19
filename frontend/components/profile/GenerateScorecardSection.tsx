'use client'

import React from 'react'
import {
  Github,
  Wallet,
  Sparkles,
  Loader2,
  Clock,
  CheckCircle2,
  Circle,
  ChevronDown,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { SolanaLinkButton } from './SolanaLinkButton'
import { motion, AnimatePresence } from 'framer-motion'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GithubStatus {
  syncStatus?: string
  lastSyncAt?: string
  cooldownUntil?: string
}

export interface WalletStatus {
  isLinked: boolean
  address?: string
  cooldownUntil?: string
}

export interface GenerateScorecardSectionProps {
  githubStatus: GithubStatus
  walletStatus: WalletStatus
  generateCooldownUntil?: string
  onSyncGithub: () => void
  onGenerate: () => void
  isGenerating: boolean
  /** Controlled open/collapsed state */
  isOpen: boolean
  onToggle: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCountdown(until: string | undefined): string | null {
  if (!until) return null
  const ms = new Date(until).getTime() - Date.now()
  if (ms <= 0) return null
  const totalMinutes = Math.ceil(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CooldownChip({ until }: { until: string | undefined }) {
  const label = formatCountdown(until)
  if (!label) return null
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 ring-1 ring-amber-500/20">
      <Clock className="h-3 w-3 shrink-0" />
      Available in {label}
    </span>
  )
}

function RowSeparator() {
  return <div className="mx-0 h-px bg-border/60" />
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GenerateScorecardSection({
  githubStatus,
  walletStatus,
  generateCooldownUntil,
  onSyncGithub,
  onGenerate,
  isGenerating,
  isOpen,
  onToggle,
}: GenerateScorecardSectionProps) {
  const syncStatus = githubStatus.syncStatus

  const githubConnected = syncStatus !== 'NOT_SYNCED'
  const githubSyncing =
    syncStatus === 'CONNECT_REQUEST' ||
    syncStatus === 'SYNC_REQUEST' ||
    syncStatus === 'SYNC_FETCH_REQUEST' ||
    syncStatus === 'SYNC_FETCH_SUCCESS'
  const githubHasSynced = syncStatus === 'SYNC_SUCCESS'
  const githubFailed = syncStatus === 'SYNC_FAILED'

  const walletSyncOnCooldown =
    !!walletStatus.cooldownUntil &&
    Date.now() < new Date(walletStatus.cooldownUntil).getTime()

  const generateOnCooldown =
    !!generateCooldownUntil &&
    Date.now() < new Date(generateCooldownUntil).getTime()

  const noSourceLinked = !githubConnected && !walletStatus.isLinked
  const generateDisabled = noSourceLinked || generateOnCooldown || isGenerating

  const generateTooltip = noSourceLinked
    ? 'Sync at least one source first'
    : generateOnCooldown
      ? `Available in ${formatCountdown(generateCooldownUntil) ?? ''}`
      : undefined

 const githubOnCooldown =
  githubHasSynced &&
  !!githubStatus.cooldownUntil &&
  Date.now() < new Date(githubStatus.cooldownUntil).getTime()

  return (
    <Card className="w-full overflow-hidden border-l-2 border-l-[hsl(var(--accent))] rounded-xl">

      {/* ── Clickable Header (always visible) ── */}
      <button
        onClick={onToggle}
        className="w-full text-left focus:outline-none"
        aria-expanded={isOpen}
      >
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Generate Scorecard
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Sync your data sources, then analyse.
            </CardDescription>
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 0 : -90 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0 text-muted-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.div>
        </CardHeader>
      </button>

      {/* ── Animated collapsible body ── */}
     <AnimatePresence initial={false} mode="sync">
  {isOpen && (
    <motion.div
      key="body"
      layout
      initial={{
        height: 0,
        opacity: 0,
        scaleY: 0.98,
      }}
      animate={{
        height: 'auto',
        opacity: 1,
        scaleY: 1,
      }}
      exit={{
        height: 0,
        opacity: 0,
        scaleY: 0.985,
      }}
      transition={{
        height: {
          type: 'spring',
          stiffness: 240,
          damping: 30,
        },
        opacity: {
          duration: 0.22,
        },
        scaleY: {
          duration: 0.28,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
      style={{
        overflow: 'hidden',
        transformOrigin: 'top',
      }}
    >
            <CardContent className="flex flex-col gap-0 px-6 pt-0 pb-5">

              {/* ── ROW: GitHub ── */}
              <div className="flex flex-col gap-1 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Github className={`h-4 w-4 shrink-0 ${githubConnected ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium text-foreground whitespace-nowrap">GitHub</span>
                    {githubSyncing ? (
                      <Badge variant="outline" className="text-[11px] border-amber-500/30 bg-amber-500/10 text-amber-400 px-1.5 py-0 font-normal">
                        <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />Syncing
                      </Badge>
                    ) : githubFailed ? (
                      <Badge variant="outline" className="text-[11px] border-red-500/30 bg-red-500/10 text-red-400 px-1.5 py-0 font-normal">Failed</Badge>
                    ) : githubHasSynced ? (
                      <Badge variant="outline" className="text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-1.5 py-0 font-normal">
                        <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                        Synced {githubStatus.lastSyncAt ? formatRelativeTime(githubStatus.lastSyncAt) : ''}
                      </Badge>
                    ) : githubConnected ? (
                      <Badge variant="outline" className="text-[11px] border-yellow-500/30 bg-yellow-500/10 text-yellow-400 px-1.5 py-0 font-normal">Connected</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] border-border bg-transparent text-muted-foreground px-1.5 py-0 font-normal">
                        <Circle className="mr-1 h-2.5 w-2.5" />Not connected
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={onSyncGithub}
disabled={githubSyncing || (githubOnCooldown && !githubFailed)}                    className="h-7 px-2.5 text-xs shrink-0 cursor-pointer"
                  >
                    {githubSyncing ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Syncing…</> : githubConnected ? 'Sync now' : 'Connect GitHub'}
                  </Button>
                </div>
                {githubOnCooldown && (
                  <div className="pl-[26px]"><CooldownChip until={githubStatus.cooldownUntil} /></div>
                )}
              </div>

              <RowSeparator />

              {/* ── ROW: Wallet ── */}
              <div className="flex flex-col gap-1 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Wallet className={`h-4 w-4 shrink-0 ${walletStatus.isLinked ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium text-foreground whitespace-nowrap">Solana Wallet</span>
                    {walletStatus.isLinked && walletStatus.address ? (
                      <Badge variant="outline" className="text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-1.5 py-0 font-normal">
                        <CheckCircle2 className="mr-1 h-2.5 w-2.5" />Linked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] border-border bg-transparent text-muted-foreground px-1.5 py-0 font-normal">
                        <Circle className="mr-1 h-2.5 w-2.5" />Not linked
                      </Badge>
                    )}
                  </div>
                  <SolanaLinkButton
                    variant="outline" size="sm"
                    className="h-7 px-2.5 text-xs shrink-0 cursor-pointer"
                    onSuccess={() => {}}
                    disabled={!!walletSyncOnCooldown}
                  />
                </div>
                {walletStatus.isLinked && walletSyncOnCooldown && (
                  <div className="pl-[26px]">
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 ring-1 ring-amber-500/20">
                      <Clock className="h-3 w-3 shrink-0" />
                      Wallet sync available in {formatCountdown(walletStatus.cooldownUntil)}
                    </span>
                  </div>
                )}
              </div>

              <RowSeparator />

              {/* ── ROW: Generate CTA ── */}
              <div className="pt-4">
                {generateTooltip ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full cursor-not-allowed">
                        <Button variant="default" size="default" disabled className="w-full pointer-events-none">
                          <Sparkles className="mr-2 h-4 w-4" />
                          Analyse &amp; generate scorecard
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">{generateTooltip}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    id="generate-scorecard-btn"
                    variant="default" size="default"
                    onClick={() => onGenerate()}
                    disabled={generateDisabled}
                    className="w-full cursor-pointer"
                  >
                    {isGenerating
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analysing…</>
                      : <><Sparkles className="mr-2 h-4 w-4" />Analyse &amp; generate scorecard</>
                    }
                  </Button>
                )}
                {generateOnCooldown && !noSourceLinked && (
                  <div className="mt-2 flex justify-center">
                    <CooldownChip until={generateCooldownUntil} />
                  </div>
                )}
              </div>

            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

export default GenerateScorecardSection
