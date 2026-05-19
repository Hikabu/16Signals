'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { EscrowSetupStep } from '@/components/jobs/EscrowSetupStep'
import { confirmEscrowFunded, getEscrowStatus } from '@/lib/api'

export default function PostJobPage() {
  const router = useRouter()
  const { connected } = useWallet()

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [step, setStep] = useState(1)
  // Hardcoded for UI demo since previous steps aren't built out
  const [jobId] = useState<string>('draft-123') 
  
  // Escrow Step State
  const [escrowState, setEscrowState] = useState<'not_connected' | 'connected' | 'funded'>('not_connected')
  const [solAmount, setSolAmount] = useState(0)
  const [txSignatureInput, setTxSignatureInput] = useState('')
  const [confirmedTxSig, setConfirmedTxSig] = useState<string | undefined>()
  const [escrowAddress] = useState('8V3X6aV2G...') // Placeholder

  // ---------------------------------------------------------------------------
  // Mutations & Queries
  // ---------------------------------------------------------------------------

  // Status Check on step entry
  const { data: escrowData } = useQuery({
    queryKey: ['escrow', jobId],
    queryFn: () => getEscrowStatus(jobId),
    enabled: !!jobId && step === 4,
  })

  // Update escrowState if already funded via backend check
  useEffect(() => {
    if (escrowData?.status === 'funded') {
      setEscrowState('funded')
      setConfirmedTxSig(escrowData.txSignature)
    }
  }, [escrowData])

  // Watch Wallet state
  useEffect(() => {
    if (step === 4 && escrowState !== 'funded') {
      if (connected) {
        setEscrowState('connected')
      } else {
        setEscrowState('not_connected')
      }
    }
  }, [connected, step, escrowState])

  // Confirm Escrow Mutation
  const { mutate: confirmFunding, isPending: isConfirming } = useMutation({
    mutationFn: (txSig: string) => confirmEscrowFunded({ jobPostId: jobId, txSignature: txSig }),
    onSuccess: (data: any) => {
      setEscrowState('funded')
      setConfirmedTxSig(data.txSignature || txSignatureInput)
      toast.success("Escrow confirmed on-chain!")
    },
    onError: () => {
      toast.error("Could not confirm. Check the transaction signature and try again.")
    }
  })

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleConfirmEscrow = () => {
    if (!txSignatureInput) return
    confirmFunding(txSignatureInput)
  }

  const handleSkipEscrow = () => {
    setStep(5)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-50">Post a Job</h1>
        <div className="text-sm font-medium text-slate-400">Step {step} of 5</div>
      </div>

      {step === 1 && (
        <div className="p-6 border rounded-2xl bg-[#0F172A] border-slate-800">
          <h2 className="text-lg font-semibold text-slate-50 mb-4">Draft Details</h2>
          <p className="text-slate-400 mb-6">Placeholder for job details form...</p>
          <button onClick={() => setStep(2)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-500 transition-colors">Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="p-6 border rounded-2xl bg-[#0F172A] border-slate-800">
          <h2 className="text-lg font-semibold text-slate-50 mb-4">Job Description Parsing</h2>
          <p className="text-slate-400 mb-6">Placeholder for JD parser...</p>
          <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-500 transition-colors">Continue</button>
        </div>
      )}

      {step === 3 && (
        <div className="p-6 border rounded-2xl bg-[#0F172A] border-slate-800">
          <h2 className="text-lg font-semibold text-slate-50 mb-4">Confirm Requirements</h2>
          <p className="text-slate-400 mb-6">Placeholder for requirements table...</p>
          <button onClick={() => setStep(4)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-500 transition-colors">Continue</button>
        </div>
      )}

      {step === 4 && (
        <EscrowSetupStep
          jobId={jobId}
          escrowState={escrowState}
          solAmount={solAmount}
          onSolAmountChange={setSolAmount}
          txSignatureInput={txSignatureInput}
          onTxSignatureChange={setTxSignatureInput}
          onConfirm={escrowState === 'funded' ? () => setStep(5) : handleConfirmEscrow}
          onSkip={handleSkipEscrow}
          isConfirming={isConfirming}
          escrowAddress={escrowAddress}
          confirmedTxSig={confirmedTxSig}
        />
      )}

      {step === 5 && (
        <div className="p-6 border rounded-2xl bg-[#0F172A] border-slate-800">
          <h2 className="text-lg font-semibold text-slate-50 mb-4">Summary & Publish</h2>
          <div className="mb-6 p-4 border border-slate-800 rounded-lg bg-[#0B1120]">
             {escrowState === 'funded' ? (
               <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                 {solAmount} SOL locked
               </span>
             ) : (
               <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
                 No escrow
               </span>
             )}
          </div>
          <button onClick={() => router.push('/hr/jobs')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-500 transition-colors">Publish Job</button>
        </div>
      )}
    </div>
  )
}
