'use client'

import React, { useState, useEffect } from 'react'
import { notFound, useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ScorecardView, ScorecardData } from '@/components/ScorecardView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

import {
  getJobApplications,
  getApplication,
  getApplicationScorecard,
  getInterviewQuestions,
  getEscrowStatus,
  updateStage,
  updateDecision,
  setEscrowCandidate,
  confirmEscrowFunded,
  confirmEscrowReleased,
  confirmEscrowRefunded,
  isValidJobPostPathId,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Stage = 'applied' | 'screening' | 'interview' | 'offer'
type Decision = 'pending' | 'approved' | 'rejected'
type EscrowState = 'NOT_SET' | 'SET' | 'FUNDED' | 'SETTLED'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string) {
  return name ? name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '??'
}

function fitColor(score: number) {
  if (score >= 80) return 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20'
  if (score >= 60) return 'text-amber-400 bg-amber-500/10 ring-amber-500/20'
  return 'text-red-400 bg-red-500/10 ring-red-500/20'
}

function stageLabel(s: string) {
  const map: Record<string, string> = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer' }
  return map[s] || s
}

function decisionBadge(d: string) {
  if (d === 'approved') return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">Approved</span>
  if (d === 'rejected') return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400 ring-1 ring-red-500/20">Rejected</span>
  return null
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">{children}</h3>
}

function Divider() {
  return <div className="my-6 h-px bg-[#253046]" />
}

// --- Application Row ---
function ApplicationRow({ candidate, selected, onClick }: { candidate: any; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150 text-left ${
        selected
          ? 'border-l-2 border-[#6C5CE7] bg-[#151C2E]'
          : 'border-l-2 border-transparent hover:bg-[#111827]'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1A2338] text-xs font-semibold text-[#94A3B8]">
        {initials(candidate.candidateName || 'User')}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#F9FAFB]">{candidate.candidateName || 'Anonymous Candidate'}</p>
        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="rounded-full bg-[#1A2338] px-1.5 py-0.5 text-[10px] text-[#94A3B8]">
            {stageLabel(candidate.stage)}
          </span>
          {decisionBadge(candidate.decision)}
        </div>
      </div>
      <span className={`shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold ring-1 tabular-nums ${fitColor(candidate.fitScore || 0)}`}>
        {candidate.fitScore || 0}
      </span>
    </button>
  )
}

// --- Gap Report ---
function GapReport({ data }: { data: any }) {
  if (!data) return null
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`text-3xl font-bold tabular-nums ${data.fitPct >= 80 ? 'text-emerald-400' : data.fitPct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
          {data.fitPct}%
        </span>
        <p className="text-sm text-[#94A3B8] leading-snug">{data.recommendation}</p>
      </div>
      {data.matched?.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Matched</p>
          <div className="flex flex-wrap gap-1.5">
            {data.matched.map((s: string) => (
              <span key={s} className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20">{s}</span>
            ))}
          </div>
        </div>
      )}
      {data.missing?.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Missing</p>
          <div className="flex flex-wrap gap-1.5">
            {data.missing.map((s: string) => (
              <span key={s} className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 ring-1 ring-red-500/20">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Interview Questions Accordion ---
function InterviewQuestionsSection({ questions, isOpen, onOpenChange }: { questions?: string[], isOpen: boolean, onOpenChange: (open: boolean) => void }) {
  const handleCopyAll = () => {
    if (questions) navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join('\n'))
  }
  
  return (
    <Accordion type="single" collapsible className="w-full" value={isOpen ? 'iq' : ''} onValueChange={(val) => onOpenChange(val === 'iq')}>
      <AccordionItem value="iq" className="border-[#253046]">
        <AccordionTrigger className="text-sm font-medium text-[#F9FAFB] hover:text-[#F9FAFB] hover:no-underline py-3">
          Interview Questions
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 pt-1 pb-2">
            {!questions ? (
              <div className="flex justify-center p-4"><span className="animate-pulse text-[#64748B]">Loading questions...</span></div>
            ) : questions.length === 0 ? (
              <p className="text-sm text-[#64748B]">No interview questions generated.</p>
            ) : (
              <>
                <ol className="space-y-2">
                  {questions.map((q, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-[#94A3B8]">
                      <span className="shrink-0 font-semibold text-[#64748B] tabular-nums">{i + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ol>
                <Button variant="outline" size="sm" onClick={handleCopyAll} className="mt-2 h-8 cursor-pointer border-[#253046] text-xs text-[#94A3B8] hover:border-[#6C5CE7] hover:text-[#F9FAFB]">
                  <svg className="mr-1.5 h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 11H3a1 1 0 01-1-1V3a1 1 0 011-1h7a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Copy all
                </Button>
              </>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

// --- Stage + Decision Controls ---
function StageDecisionControls({ candidate, onStageChange, onDecision, stageLoading }: { candidate: any, onStageChange: (s: string) => void, onDecision: (d: string) => void, stageLoading: boolean }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-sm text-[#94A3B8]">Stage</Label>
        <Select value={candidate.stage} onValueChange={onStageChange} disabled={stageLoading}>
          <SelectTrigger className="h-11 rounded-xl border-[#253046] bg-[#111827] text-[#F9FAFB] focus:ring-1 focus:ring-[#6C5CE7]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[#253046] bg-[#151C2E]">
            {(['applied', 'screening', 'interview', 'offer']).map((s) => (
              <SelectItem key={s} value={s} className="text-[#F9FAFB] focus:bg-[#1A2338] focus:text-[#F9FAFB]">
                {stageLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm text-[#94A3B8]">Decision</Label>
        <div className="flex gap-2">
          <Button id="decision-approve" variant={candidate.decision === 'approved' ? 'default' : 'outline'} size="sm" onClick={() => onDecision('approved')} className={`flex-1 h-10 cursor-pointer rounded-xl text-sm font-medium transition-colors ${candidate.decision === 'approved' ? 'bg-emerald-600 text-white hover:bg-emerald-500 border-0' : 'border-[#253046] text-[#94A3B8] hover:border-emerald-500/40 hover:text-emerald-400'}`}>
            Approve
          </Button>
          <Button id="decision-reject" variant={candidate.decision === 'rejected' ? 'destructive' : 'outline'} size="sm" onClick={() => onDecision('rejected')} className={`flex-1 h-10 cursor-pointer rounded-xl text-sm font-medium transition-colors ${candidate.decision === 'rejected' ? 'bg-red-600 text-white hover:bg-red-500 border-0' : 'border-[#253046] text-[#94A3B8] hover:border-red-500/40 hover:text-red-400'}`}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  )
}

// --- Escrow Management ---
function EscrowManagement({
  escrowData,
  onSetCandidate,
  onConfirmFunded,
  onRelease,
  onRefund,
  isSetting,
  isConfirming,
  isReleasing,
  isRefunding
}: {
  escrowData: any,
  onSetCandidate: (walletAddress: string) => void,
  onConfirmFunded: (txSig: string) => void,
  onRelease: () => void,
  onRefund: () => void,
  isSetting: boolean,
  isConfirming: boolean,
  isReleasing: boolean,
  isRefunding: boolean
}) {
  const [candidateWallet, setCandidateWallet] = useState('')
  const [txSigInput, setTxSigInput] = useState('')

  const status = escrowData?.status || 'not_set'

  if (status === 'not_set') return (
    <div className="space-y-3">
      <p className="text-sm text-[#64748B]">Set wallet addresses to initialize escrow for this candidate.</p>
      <div className="space-y-2">
        <Label className="text-sm text-[#94A3B8]">Candidate wallet</Label>
        <Input value={candidateWallet} onChange={(e) => setCandidateWallet(e.target.value)} placeholder="Candidate Solana address" className="h-10 rounded-xl border-[#253046] bg-[#111827] text-[#F9FAFB] font-mono text-sm" />
      </div>
      <Button disabled={!candidateWallet || isSetting} onClick={() => onSetCandidate(candidateWallet)} className="w-full h-10 cursor-pointer rounded-xl bg-[#6C5CE7] text-sm font-medium text-white hover:bg-[#7C6CF0]">
        {isSetting ? 'Setting...' : 'Set candidate'}
      </Button>
    </div>
  )

  if (status === 'set') return (
    <div className="space-y-3">
      <p className="text-sm text-[#94A3B8]">Escrow initialized. Fund the escrow address and confirm below.</p>
      <div className="space-y-2">
        <Label className="text-sm text-[#94A3B8]">Transaction Signature</Label>
        <Input value={txSigInput} onChange={(e) => setTxSigInput(e.target.value)} placeholder="Tx Signature" className="h-10 rounded-xl border-[#253046] bg-[#111827] text-[#F9FAFB] font-mono text-sm" />
      </div>
      <Button disabled={!txSigInput || isConfirming} onClick={() => onConfirmFunded(txSigInput)} className="w-full h-10 cursor-pointer rounded-xl bg-[#6C5CE7] text-sm font-medium text-white hover:bg-[#7C6CF0]">
        {isConfirming ? 'Confirming...' : 'Confirm funded'}
      </Button>
    </div>
  )

  if (status === 'funded') return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <p className="text-sm text-emerald-400 font-medium">Escrow funded, waiting for release</p>
      </div>
      <div className="flex gap-2">
        <Button disabled={isReleasing} onClick={onRelease} className="flex-1 h-10 cursor-pointer rounded-xl bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-500">
          {isReleasing ? 'Releasing...' : 'Release payment'}
        </Button>
        <Button disabled={isRefunding} onClick={onRefund} variant="outline" className="flex-1 h-10 cursor-pointer rounded-xl border-[#253046] text-sm text-[#94A3B8] hover:border-red-500/40 hover:text-red-400">
          {isRefunding ? 'Refunding...' : 'Refund'}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1A2338] px-3 py-1 text-xs font-medium text-[#94A3B8] ring-1 ring-[#253046]">
        <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Settled, {status}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function CandidatePipelinePageInner({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient()

  const jobApisEnabled = isValidJobPostPathId(jobId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileShowDetail, setMobileShowDetail] = useState(false)
  const [interviewOpen, setInterviewOpen] = useState(false)

  // -- Queries --
  const { data: applicationsResponse } = useQuery({
    queryKey: ['applications', jobId],
    queryFn: () => getJobApplications(jobId),
    enabled: jobApisEnabled,
  })
  
  const candidates = (applicationsResponse as any)?.data || []
  
  // Set initial selection
  useEffect(() => {
    if (candidates.length > 0 && !selectedId) {
      setSelectedId(candidates[0].id)
    }
  }, [candidates, selectedId])

  const { data: detailData } = useQuery({
    queryKey: ['application', selectedId],
    queryFn: () => getApplication(selectedId!),
    enabled: !!selectedId,
  })
  
  const { data: scorecardData } = useQuery({
    queryKey: ['applicationScorecard', selectedId],
    queryFn: () => getApplicationScorecard(selectedId!),
    enabled: !!selectedId,
  })
  
  const { data: interviewData } = useQuery({
    queryKey: ['interviewQuestions', selectedId],
    queryFn: () => getInterviewQuestions(selectedId!),
    enabled: interviewOpen && !!selectedId,
  })

  const { data: escrowData } = useQuery({
    queryKey: ['escrow', jobId],
    queryFn: () => getEscrowStatus(jobId),
    enabled: jobApisEnabled,
    refetchInterval: (query) => (query.state.data as any)?.status === 'funded' ? 5000 : false,
  })

  // -- Mutations --
  const { mutate: mutateStage, isPending: stageLoading } = useMutation({
    mutationFn: (stage: string) => updateStage({ applicationId: selectedId!, stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications', jobId] }),
  })

  const { mutate: mutateDecision } = useMutation({
    mutationFn: (decision: string) => updateDecision({ applicationId: selectedId!, decision }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications', jobId] }),
  })

  const { mutate: mutateSetCandidate, isPending: isSettingCandidate } = useMutation({
    mutationFn: (walletAddress: string) => {
      if (!isValidJobPostPathId(jobId)) throw new Error('Missing job id.')
      if (!selectedId) throw new Error('Missing application.')
      return setEscrowCandidate({ jobPostId: jobId, candidateId: selectedId, walletAddress })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escrow', jobId] }),
  })

  const { mutate: mutateConfirmFunded, isPending: isConfirmingFunded } = useMutation({
    mutationFn: (txSig: string) => {
      if (!isValidJobPostPathId(jobId)) throw new Error('Missing job id.')
      return confirmEscrowFunded({ jobPostId: jobId, txSignature: txSig })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escrow', jobId] }),
  })

  const { mutate: mutateConfirmReleased, isPending: isConfirmingReleased } = useMutation({
    mutationFn: () => {
      if (!isValidJobPostPathId(jobId)) throw new Error('Missing job id.')
      return confirmEscrowReleased({ jobPostId: jobId })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escrow', jobId] }),
  })

  const { mutate: mutateConfirmRefunded, isPending: isConfirmingRefunded } = useMutation({
    mutationFn: () => {
      if (!isValidJobPostPathId(jobId)) throw new Error('Missing job id.')
      return confirmEscrowRefunded({ jobPostId: jobId })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escrow', jobId] }),
  })

  // -- Handlers --
  const handleSelectRow = (id: string) => {
    setSelectedId(id)
    setMobileShowDetail(true)
    setInterviewOpen(false)
  }

  const handleStageChange = (stage: string) => {
    mutateStage(stage)
  }

  const handleDecision = (decision: string) => {
    mutateDecision(decision)
  }

  const selectedCandidateListInfo = candidates.find((c: any) => c.id === selectedId)
  const selectedAppDetail = detailData ? (detailData as any) : selectedCandidateListInfo

  return (
    <div className="flex h-screen flex-col bg-[#0B1020] overflow-hidden">
      {/* Page header */}
      <header className="shrink-0 border-b border-[#253046] px-6 py-4">
        <div className="flex items-center gap-3">
          <a href="/hr/jobs" className="text-[#64748B] hover:text-[#94A3B8] transition-colors">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15l-5-5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <div>
            <h1 className="text-base font-semibold text-[#F9FAFB]">Candidate Pipeline</h1>
            <p className="text-xs text-[#64748B]">Job #{jobId} · {candidates.length} applicants</p>
          </div>
        </div>
      </header>

      {/* Body: 2-col desktop, stacked mobile */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT RAIL ──────────────────────────────────────────────────── */}
        <aside
          className={`
            shrink-0 border-r border-[#253046] overflow-y-auto
            w-full md:w-[35%]
            ${mobileShowDetail ? 'hidden md:block' : 'block'}
          `}
        >
          <div className="py-2">
            {candidates.map((c: any) => (
              <ApplicationRow
                key={c.id}
                candidate={c}
                selected={c.id === selectedId}
                onClick={() => handleSelectRow(c.id)}
              />
            ))}
            {candidates.length === 0 && (
              <div className="p-6 text-center text-sm text-[#64748B]">No applicants yet.</div>
            )}
          </div>
        </aside>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {(mobileShowDetail || true) && selectedAppDetail && (
            <motion.main
              key={selectedId}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className={`
                flex-1 overflow-y-auto px-6 py-6
                ${mobileShowDetail ? 'block' : 'hidden md:block'}
              `}
            >
              {/* Mobile back button */}
              <div className="mb-4 md:hidden">
                <button
                  type="button"
                  onClick={() => setMobileShowDetail(false)}
                  className="flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#F9FAFB] transition-colors cursor-pointer"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back to list
                </button>
              </div>

              {/* Candidate name header */}
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1A2338] text-sm font-semibold text-[#94A3B8]">
                  {initials(selectedAppDetail.candidateName)}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#F9FAFB]">{selectedAppDetail.candidateName || 'Anonymous'}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`rounded-lg px-2 py-0.5 text-sm font-bold ring-1 tabular-nums ${fitColor(selectedAppDetail.fitScore || 0)}`}>
                      {selectedAppDetail.fitScore || 0}% fit
                    </span>
                    {decisionBadge(selectedAppDetail.decision)}
                  </div>
                </div>
              </div>

              {/* S1: Scorecard */}
              {scorecardData && (
                <>
                  <SectionHeading>Scorecard</SectionHeading>
                  <ScorecardView scorecard={scorecardData as unknown as ScorecardData} isPublic />
                  <Divider />
                </>
              )}

              {/* S2: Gap Report */}
              {selectedAppDetail.gapData && (
                <>
                  <SectionHeading>Gap Analysis</SectionHeading>
                  <GapReport data={selectedAppDetail.gapData} />
                  <Divider />
                </>
              )}

              {/* S3: Interview Questions */}
              <InterviewQuestionsSection 
                questions={interviewData as any} 
                isOpen={interviewOpen} 
                onOpenChange={setInterviewOpen} 
              />
              <Divider />

              {/* S4: Stage + Decision */}
              <SectionHeading>Stage &amp; Decision</SectionHeading>
              <StageDecisionControls
                candidate={selectedAppDetail}
                onStageChange={handleStageChange}
                onDecision={handleDecision}
                stageLoading={stageLoading}
              />

              {/* S5: Escrow (approved only) */}
              {selectedAppDetail.decision === 'approved' && (
                <>
                  <Divider />
                  <SectionHeading>Escrow</SectionHeading>
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-950/10 p-4">
                    <EscrowManagement 
                      escrowData={escrowData} 
                      onSetCandidate={mutateSetCandidate}
                      onConfirmFunded={mutateConfirmFunded}
                      onRelease={mutateConfirmReleased}
                      onRefund={mutateConfirmRefunded}
                      isSetting={isSettingCandidate}
                      isConfirming={isConfirmingFunded}
                      isReleasing={isConfirmingReleased}
                      isRefunding={isConfirmingRefunded}
                    />
                  </div>
                </>
              )}

              <div className="h-12" />
            </motion.main>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function CandidatePipelinePage() {
  const params = useParams()
  const rawId = params?.id
  const jobId =
    typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : ''

  if (!isValidJobPostPathId(jobId)) {
    notFound()
  }

  return <CandidatePipelinePageInner jobId={jobId} />
}
