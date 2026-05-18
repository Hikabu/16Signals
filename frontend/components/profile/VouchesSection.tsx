'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { ShieldCheck, Shield, ExternalLink, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Vouch {
  voucherWallet: string
  message?: string
  txSignature: string
  createdAt: string
  voucherUser?: string | null
}

interface VouchesSectionProps {
  vouches: Vouch[]
  /** When true: read-only (no remove buttons, etc.) */
  isPublic: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INITIAL_SHOW = 5

function truncateWallet(address: string): string {
  if (address.length <= 11) return address
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

function relativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// CopyWallet, inline copy button for a wallet address
// ---------------------------------------------------------------------------

function CopyWallet({ address }: { address: string }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast({ title: 'Address copied!' })
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast({ title: 'Could not copy address', variant: 'destructive' })
    }
  }

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy wallet address"
      className="group inline-flex items-center gap-1.5 rounded text-sm font-mono font-medium text-foreground/90 transition-colors hover:text-foreground cursor-pointer"
    >
      <span>{truncateWallet(address)}</span>
      <span className="text-muted-foreground/40 transition-colors group-hover:text-muted-foreground">
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// VouchCard
// ---------------------------------------------------------------------------

interface VouchCardProps {
  vouch: Vouch
  index: number
}

function VouchCard({ vouch, index }: VouchCardProps) {
  const explorerUrl = `https://explorer.solana.com/tx/${vouch.txSignature}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut', delay: index * 0.06 }}
      className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/5 px-3 py-2.5"
    >
      {/* Left icon */}
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-500/10 border border-teal-500/20">
        <ShieldCheck className="h-4 w-4 text-teal-500" />
      </div>

     {/* Content */}
<div className="min-w-0 flex-1 space-y-2">

  {/* Main vouch message */}
  {vouch.message && (
    <p className="text-sm leading-relaxed text-foreground">
      &ldquo;{vouch.message}&rdquo;
    </p>
  )}

  {/* Attribution row */}
  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">

    <span>—</span>

    {vouch.voucherUser ? (
      <Link
        href={`/u/${vouch.voucherUser}`}
        className="font-medium text-foreground transition-colors hover:text-primary"
      >
        @{vouch.voucherUser}
      </Link>
    ) : (
      <CopyWallet address={vouch.voucherWallet} />
    )}

    <span>•</span>

    <span>
      {relativeTime(vouch.createdAt)}
    </span>

    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View transaction on Solana Explorer"
      className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
    >
      <ExternalLink className="h-3 w-3" />
      Explorer
    </a>
  </div>
</div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Shield className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
      <p className="text-sm font-medium text-muted-foreground">No vouches yet.</p>
      <p className="text-xs text-muted-foreground/60">Be the first to vouch on-chain.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VouchesSection
// ---------------------------------------------------------------------------

export function VouchesSection({ vouches, isPublic }: VouchesSectionProps) {
  const [expanded, setExpanded] = useState(false)

  const hasMore = vouches.length > INITIAL_SHOW
  const visibleVouches = expanded ? vouches : vouches.slice(0, INITIAL_SHOW)
  const hiddenCount = vouches.length - INITIAL_SHOW

  return (
    <section aria-label="Vouches">
      {/* Section header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Vouches</span>
        {vouches.length > 0 && (
          <Badge
            variant="outline"
            className="rounded-full border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary"
          >
            {vouches.length}
          </Badge>
        )}
      </div>

      {/* Card container */}
      <Card className="overflow-hidden p-3">
        {vouches.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {visibleVouches.map((vouch, i) => (
                <VouchCard key={vouch.txSignature} vouch={vouch} index={i} />
              ))}
            </AnimatePresence>

            {/* Show more / collapse */}
            {hasMore && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pt-1"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((v) => !v)}
                  className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Show {hiddenCount} more
                    </>
                  )}
                </Button>
              </motion.div>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

export default VouchesSection
