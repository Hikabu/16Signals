'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { initiateVouch, confirmVouch } from '@/lib/api'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VouchFormProps {
  username: string
  ownerWalletAddress: string
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEP_COUNT = 6

function StepDot({ index, current }: { index: number; current: number }) {
  const step = index + 1
  const isDone = step < current
  const isActive = step === current

  return (
    <div className="flex items-center justify-center">
      {isDone ? (
        // Checkmark circle
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/50">
          <svg
            className="h-3 w-3 text-emerald-400"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : isActive ? (
        // Filled dot
        <div className="relative flex h-6 w-6 items-center justify-center">
          <div className="absolute h-full w-full rounded-full bg-[#6C5CE7]/20 ring-1 ring-[#6C5CE7]/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#6C5CE7]" />
        </div>
      ) : (
        // Empty dot
        <div className="h-6 w-6 rounded-full ring-1 ring-[#253046]" />
      )}
    </div>
  )
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: STEP_COUNT }).map((_, i) => (
        <React.Fragment key={i}>
          <StepDot index={i} current={current} />
          {i < STEP_COUNT - 1 && (
            <div
              className={`h-px flex-1 transition-colors duration-300 ${
                i + 1 < current ? 'bg-emerald-500/40' : 'bg-[#253046]'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared step motion wrapper
// ---------------------------------------------------------------------------

const stepVariants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

function StepWrapper({ children, stepKey }: { children: React.ReactNode; stepKey: number }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex flex-col items-center gap-4 py-2"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="h-7 w-7 animate-spin text-[#6C5CE7]"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Step content components
// ---------------------------------------------------------------------------

// Step 1: Connect wallet
function StepConnect({ isLoading }: { isLoading: boolean }) {
    const [mounted, setMounted] = useState(false)

useEffect(() => {
  setMounted(true)
}, [])
  return (
    <StepWrapper stepKey={1}>
      <p className="text-sm text-[#94A3B8]">Connect your wallet to vouch on-chain</p>
      {/* WalletMultiButton is injected by the Solana wallet adapter provider.
          We render a lightweight wrapper so styling stays consistent with the
          design system. The actual button is sourced at the provider level.  */}
      <div
        id="vouch-wallet-connect"
        className="flex justify-center [&_button]:!rounded-xl [&_button]:!bg-[#1A2338] [&_button]:!ring-1 [&_button]:!ring-[#253046] [&_button]:!text-sm [&_button]:!font-medium [&_button]:!text-[#F9FAFB] [&_button:hover]:!bg-[#253046] [&_button]:!h-11 [&_button]:!px-5 [&_button]:!transition-colors [&_button]:!duration-150"
      >
        {/* We render WalletMultiButton natively here so the user can connect seamlessly */}
        <div className="hidden md:flex items-center gap-2">
  {mounted && <WalletMultiButton />}
</div>
      </div>
    </StepWrapper>
  )
}

// Step 2: Write message
const MAX_LENGTH = 280

function StepMessage({
  message,
  onMessageChange,
  onSubmit,
  isLoading,
}: {
  message: string
  onMessageChange: (v: string) => void
  onSubmit: () => void
  isLoading: boolean
}) {
  const remaining = MAX_LENGTH - message.length
  const isNearLimit = remaining <= 30

  return (
    <StepWrapper stepKey={2}>
      <p className="w-full text-left text-sm text-[#94A3B8]">
        Leave a message with your vouch{' '}
        <span className="text-[#64748B]">(optional)</span>
      </p>
      <div className="w-full space-y-2">
        <Textarea
          id="vouch-message"
          rows={3}
          maxLength={MAX_LENGTH}
          placeholder="This developer ships quality code and has excellent attention to…"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          className="resize-none bg-[#111827] border-[#253046] text-[#F9FAFB] placeholder:text-[#64748B] text-sm rounded-xl focus:ring-1 focus:ring-[#6C5CE7]/50 focus:border-[#6C5CE7]/50 transition-colors"
          disabled={isLoading}
        />
        <div className="flex justify-end">
          <span
            className={`text-xs tabular-nums transition-colors ${
              isNearLimit ? 'text-amber-400' : 'text-[#64748B]'
            }`}
          >
            {remaining} / {MAX_LENGTH}
          </span>
        </div>
      </div>
      <Button
        id="vouch-submit"
        onClick={onSubmit}
  //       onClick={() => {
  //   console.log("🔥 DIRECT HTML BUTTON CLICKED")
  //   handleVouch()
  // }}
        disabled={isLoading}
        className="h-11 w-full rounded-xl bg-[#6C5CE7] text-sm font-medium text-white hover:bg-[#7C6CF0] transition-colors disabled:opacity-50 cursor-pointer"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <Spinner />
            Preparing…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Vouch on-chain
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </Button>
    </StepWrapper>
  )
}

// Steps 3–5: Pending spinners
const PENDING_STEPS: Record<number, string> = {
  3: 'Preparing transaction…',
  4: 'Waiting for wallet signature…',
  5: 'Broadcasting to Solana…',
}

function StepPending({ step }: { step: 3 | 4 | 5 }) {
  return (
    <StepWrapper stepKey={step}>
      <Spinner />
      <p className="text-sm text-[#94A3B8]">{PENDING_STEPS[step]}</p>
    </StepWrapper>
  )
}

// Step 6: Success
function StepSuccess({
  username,
  txSignature,
}: {
  username: string
  txSignature?: string
}) {
  const explorerUrl = txSignature
    ? `https://explorer.solana.com/tx/${txSignature}`
    : undefined

  return (
    <StepWrapper stepKey={6}>
      {/* Green checkmark */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
        <svg
          className="h-8 w-8 text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
        >
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
        <p className="text-sm font-medium text-[#F9FAFB]">
          Your vouch is on-chain ✓
        </p>
        <p className="text-xs text-[#64748B]">
          This vouch strengthens @{username}'s reputation score.
        </p>
      </div>

      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          id="vouch-tx-link"
          className="inline-flex items-center gap-1.5 text-xs text-[#6C5CE7] hover:text-[#7C6CF0] transition-colors"
        >
          View transaction on Solana Explorer
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
    </StepWrapper>
  )
}

// ---------------------------------------------------------------------------
// Self-vouch guard
// ---------------------------------------------------------------------------

function SelfVouchGuard() {
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1A2338] ring-1 ring-[#253046]">
        <svg
          className="h-5 w-5 text-[#64748B]"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 1114 0H3z"
            fill="currentColor"
            fillOpacity="0.5"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-[#94A3B8]">
        This is your profile.
      </p>
      <p className="text-xs text-[#64748B]">You can't self-vouch.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VouchForm({
  username,
  ownerWalletAddress,
}: VouchFormProps) {
  const { publicKey, connected, signTransaction } = useWallet()
  const { connection } = useConnection()
  const queryClient = useQueryClient()
  const router = useRouter()

  const [step, setStep] = useState<number>(1)
  const [txSignature, setTxSignature] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const viewerWallet = publicKey?.toBase58() ?? null

  // Self-vouch guard
  const isSelfVouch =
    viewerWallet !== null &&
    ownerWalletAddress !== '' &&
    viewerWallet === ownerWalletAddress

  useEffect(() => {
    if (connected && step === 1) {
      setStep(2)
    } else if (!connected && step > 1 && step < 6) {
      setStep(1)
    }
  }, [connected, step])

  const handleVouch = async () => {
  console.log("hhhhh");

  try {
    setError(null)

    // Step 3, initiate
    setStep(3)

    if (!publicKey) {
      throw new Error("Wallet not connected")
    }

    const viewerWallet = publicKey.toBase58()

    console.log("━━━━━━━━━━━━━━━━━━━━")
    console.log("STEP 1, HANDLE VOUCH")
    console.log("username:", username)
    console.log("message:", message)
    console.log("wallet:", viewerWallet)
    console.log("━━━━━━━━━━━━━━━━━━━━")

    // 🚨 FIX #1: wrap API call safely
    let res
    try {
      res = await initiateVouch(
        username,
        { message },
        viewerWallet
      )
    } catch (apiErr: any) {
      console.error("initiateVouch failed:", apiErr)
      throw new Error(
        apiErr?.message?.message ||
        apiErr?.message ||
        "Failed to initiate vouch"
      )
    }

    // 🚨 FIX #2: validate response
    const txData = res?.transaction

    if (!txData) {
      console.error("Bad response:", res)
      throw new Error("Backend did not return txData")
    }

    // Step 4, sign
    setStep(4)

    const tx = Transaction.from(
      Buffer.from(txData, "base64")
    )

    if (!signTransaction) {
      throw new Error("Wallet does not support signing")
    }

    const signed = await signTransaction(tx)

    // Step 5, broadcast
    setStep(5)

    const sig = await connection.sendRawTransaction(
      signed.serialize()
    )

    await connection.confirmTransaction(sig)

    setTxSignature(sig)

    // Step 6, confirm on-chain
    // await confirmVouch({ signature: sig, txData })

    await confirmVouch({
      candidateIdentifier: username,
      message,
      txSignature: sig,
    })

    setStep(6)

    queryClient.invalidateQueries({
      queryKey: ["publicScorecard", username],
    })

    router.refresh()
  } catch (err: any) {
    console.error("Vouch error:", err)

    setError(err.message || "An error occurred while vouching")

    setStep(2) // back to form
  }
}
  const isLoading = step === 3 || step === 4 || step === 5

  return (
    <section
      aria-label="Vouch form"
      className="rounded-2xl border border-[#253046] bg-[#151C2E] p-6 shadow-sm shadow-black/20"
    >
      {/* Header */}
      <div className="mb-5 space-y-1">
        <h2 className="text-base font-semibold text-[#F9FAFB]">Vouch for @{username}</h2>
        <p className="text-xs text-[#64748B]">
          On-chain reputation, permanently linked to your wallet
        </p>
      </div>

      {/* Self-vouch guard */}
      {isSelfVouch ? (
        <SelfVouchGuard />
      ) : (
        <>
          {/* Step indicator */}
          {step < 6 && (
            <div className="mb-6">
              <StepIndicator current={step} />
            </div>
          )}

          {/* Step content */}
          <div className="min-h-[120px]">
            {step === 1 && <StepConnect isLoading={isLoading} />}
            {step === 2 && (
              <StepMessage
                message={message}
                onMessageChange={setMessage}
                onSubmit={handleVouch}
                isLoading={isLoading}
              />
            )}
            {(step === 3 || step === 4 || step === 5) && (
              <StepPending step={step as 3 | 4 | 5} />
            )}
            {step === 6 && (
              <StepSuccess username={username} txSignature={txSignature} />
            )}
          </div>

          {/* Error alert */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="mt-4"
              >
                <Alert variant="destructive" className="rounded-xl border-red-900/50 bg-red-950/30 text-red-400">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  )
}

export default VouchForm
