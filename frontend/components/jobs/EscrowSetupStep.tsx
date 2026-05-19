'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EscrowSetupStepProps {
  jobId: string
  escrowState: 'not_connected' | 'connected' | 'funded'
  solAmount: number
  onSolAmountChange: (n: number) => void
  txSignatureInput: string
  onTxSignatureChange: (s: string) => void
  onConfirm: () => void
  onSkip: () => void
  isConfirming: boolean
  escrowAddress?: string
  confirmedTxSig?: string
}

// ---------------------------------------------------------------------------
// Solana logo SVG (official mark)
// ---------------------------------------------------------------------------

function SolanaLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 397 311"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Solana"
      role="img"
    >
      <path
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"
        fill="url(#sol-a)"
      />
      <path
        d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5C.7 77.6-2.2 70.6 1.9 66.5l62.7-62.7z"
        fill="url(#sol-b)"
      />
      <path
        d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
        fill="url(#sol-c)"
      />
      <defs>
        <linearGradient id="sol-a" x1="360.9" y1="351.6" x2="141.2" y2="-69.2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF" />
          <stop offset="0.914" stopColor="#14F195" />
        </linearGradient>
        <linearGradient id="sol-b" x1="274.4" y1="351.6" x2="54.7" y2="-69.2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF" />
          <stop offset="0.914" stopColor="#14F195" />
        </linearGradient>
        <linearGradient id="sol-c" x1="317.5" y1="351.6" x2="97.9" y2="-69.1" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF" />
          <stop offset="0.914" stopColor="#14F195" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Inline spinner
// ---------------------------------------------------------------------------

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      style={{ width: size, height: size }}
      className="animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Skip link
// ---------------------------------------------------------------------------

function SkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      className="mt-2 text-xs text-violet-400/70 hover:text-violet-300 underline underline-offset-2 transition-colors cursor-pointer"
    >
      Skip for now →
    </button>
  )
}

// ---------------------------------------------------------------------------
// State: not_connected
// ---------------------------------------------------------------------------

function StateNotConnected({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <p className="text-sm text-[#94A3B8]">Connect wallet to continue.</p>
      {/* The actual WalletMultiButton is injected by the adapter provider.
          We style a placeholder that respects the design system. */}
      <div
        id="escrow-wallet-connect"
        className="
          flex justify-center
          [&_button]:!rounded-xl [&_button]:!bg-violet-900/50 [&_button]:!ring-1 [&_button]:!ring-violet-500/40
          [&_button]:!text-sm [&_button]:!font-medium [&_button]:!text-violet-100
          [&_button:hover]:!bg-violet-800/60 [&_button]:!h-11 [&_button]:!px-6
          [&_button]:!transition-colors [&_button]:!duration-150
        "
      >
        <button
          type="button"
          className="flex h-11 items-center gap-2.5 rounded-xl bg-violet-900/50 px-6 text-sm font-medium text-violet-100 ring-1 ring-violet-500/40 transition-colors duration-150 hover:bg-violet-800/60 cursor-pointer"
        >
          <svg className="h-4 w-4 text-violet-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path d="M16 13a1 1 0 100-2 1 1 0 000 2z" strokeLinecap="round" />
            <path d="M3 9V7a2 2 0 012-2h14a2 2 0 012 2v2" />
          </svg>
          Connect Wallet
        </button>
      </div>
      <SkipLink onSkip={onSkip} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// State: connected
// ---------------------------------------------------------------------------

function StateCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy to clipboard"
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-violet-400 ring-1 ring-violet-500/20 transition-colors hover:bg-violet-900/40 hover:text-violet-200 cursor-pointer"
    >
      {copied ? (
        <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 11H3a1 1 0 01-1-1V3a1 1 0 011-1h7a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}

function StateConnected({
  solAmount,
  onSolAmountChange,
  txSignatureInput,
  onTxSignatureChange,
  onConfirm,
  onSkip,
  isConfirming,
  escrowAddress,
}: Pick<
  EscrowSetupStepProps,
  | 'solAmount'
  | 'onSolAmountChange'
  | 'txSignatureInput'
  | 'onTxSignatureChange'
  | 'onConfirm'
  | 'onSkip'
  | 'isConfirming'
  | 'escrowAddress'
>) {
  return (
    <div className="flex flex-col gap-4">
      {/* SOL amount */}
      <div className="space-y-1.5">
        <Label htmlFor="escrow-sol-amount" className="text-sm text-[#94A3B8]">
          Amount to lock
        </Label>
        <div className="relative flex items-center">
          <Input
            id="escrow-sol-amount"
            type="number"
            min={0.1}
            step={0.1}
            value={solAmount}
            onChange={(e) => onSolAmountChange(parseFloat(e.target.value) || 0)}
            className="h-11 rounded-xl bg-[#111827] border-violet-500/20 text-[#F9FAFB] pr-14 focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500/40 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="pointer-events-none absolute right-4 text-sm font-medium text-violet-300">
            SOL
          </span>
        </div>
      </div>

      {/* Escrow address */}
      {escrowAddress && (
        <div className="space-y-1.5">
          <Label className="text-sm text-[#94A3B8]">Escrow address</Label>
          <div className="flex items-center gap-2 rounded-xl border border-violet-500/20 bg-[#111827] px-3 py-2">
            <code className="flex-1 truncate text-xs font-mono text-violet-200 select-all">
              {escrowAddress}
            </code>
            <StateCopyButton text={escrowAddress} />
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Send{' '}
            <span className="font-medium text-violet-300">{solAmount} SOL</span>{' '}
            to the above address in your wallet. Paste the transaction signature below.
          </p>
        </div>
      )}

      {/* Transaction signature */}
      <div className="space-y-1.5">
        <Label htmlFor="escrow-tx-sig" className="text-sm text-[#94A3B8]">
          Transaction signature
        </Label>
        <Input
          id="escrow-tx-sig"
          type="text"
          placeholder="5cGh3j…"
          value={txSignatureInput}
          onChange={(e) => onTxSignatureChange(e.target.value)}
          className="h-11 rounded-xl bg-[#111827] border-violet-500/20 text-[#F9FAFB] font-mono text-sm placeholder:text-[#64748B] placeholder:font-sans focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500/40 transition-colors"
          disabled={isConfirming}
        />
      </div>

      {/* Confirm button */}
      <Button
        id="escrow-confirm"
        type="button"
        onClick={onConfirm}
        disabled={isConfirming || !txSignatureInput.trim()}
        className="h-11 w-full rounded-xl bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50 cursor-pointer"
      >
        {isConfirming ? (
          <span className="flex items-center gap-2">
            <Spinner size={15} />
            Confirming…
          </span>
        ) : (
          'Confirm funding'
        )}
      </Button>

      <div className="flex justify-center">
        <SkipLink onSkip={onSkip} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// State: funded
// ---------------------------------------------------------------------------

function StateFunded({
  solAmount,
  confirmedTxSig,
  onConfirm,
}: {
  solAmount: number
  confirmedTxSig?: string
  onConfirm: () => void
}) {
  const explorerUrl = confirmedTxSig
    ? `https://explorer.solana.com/tx/${confirmedTxSig}`
    : undefined

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Checkmark */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
        <svg className="h-7 w-7 text-emerald-400" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="space-y-1 text-center">
        <p className="text-sm font-semibold text-[#F9FAFB]">
          Escrow funded · {solAmount} SOL locked
        </p>
        <p className="text-xs text-[#64748B]">
          Funds will be released to the candidate when you hire.
        </p>
      </div>

      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          id="escrow-explorer-link"
          className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          View on Solana Explorer
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path
              d="M3.5 8.5l5-5M5 3.5h3.5V7"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      )}

      <Button
        id="escrow-continue"
        type="button"
        onClick={onConfirm}
        className="h-11 w-full rounded-xl bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 transition-colors cursor-pointer"
      >
        Continue to publish →
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EscrowSetupStep({
  jobId: _jobId,
  escrowState,
  solAmount,
  onSolAmountChange,
  txSignatureInput,
  onTxSignatureChange,
  onConfirm,
  onSkip,
  isConfirming,
  escrowAddress,
  confirmedTxSig,
}: EscrowSetupStepProps) {
  return (
    <section
      aria-label="Escrow setup"
      className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-6"
    >
      {/* Header */}
      <div className="mb-5 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-[#F9FAFB]">Attach an escrow</h2>
          <SolanaLogo size={20} />
          <span className="rounded-full bg-violet-900/40 px-2 py-0.5 text-xs font-medium text-violet-300 ring-1 ring-violet-500/20">
            Powered by Solana
          </span>
        </div>
        <p className="text-sm text-[#64748B] leading-relaxed">
          Lock SOL in escrow as proof of commitment. Released to candidate when you hire.
        </p>
      </div>

      {/* Divider */}
      <div className="mb-5 h-px bg-violet-500/10" />

      {/* State content */}
      {escrowState === 'not_connected' && (
        <StateNotConnected onSkip={onSkip} />
      )}
      {escrowState === 'connected' && (
        <StateConnected
          solAmount={solAmount}
          onSolAmountChange={onSolAmountChange}
          txSignatureInput={txSignatureInput}
          onTxSignatureChange={onTxSignatureChange}
          onConfirm={onConfirm}
          onSkip={onSkip}
          isConfirming={isConfirming}
          escrowAddress={escrowAddress}
        />
      )}
      {escrowState === 'funded' && (
        <StateFunded
          solAmount={solAmount}
          confirmedTxSig={confirmedTxSig}
          onConfirm={onConfirm}
        />
      )}
    </section>
  )
}

export default EscrowSetupStep
