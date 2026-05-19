'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { startAnalysis, getMyScorecard, getMyRawScorecard } from '@/lib/api'
import { ScorecardView } from '@/components/ScorecardView'
import { AnalysisPoller } from '@/components/AnalysisPoller'
import { normalizeScorecard } from '@/lib/scorecard/normalizeScorecard'
import { LoadingSkeleton } from '../LoadingSkeleton'

type ScorecardState = 'idle' | 'analyzing' | 'done'

function isScorecardReady(normalized: ReturnType<typeof normalizeScorecard> | null | undefined): boolean {
  if (!normalized) return false
  return typeof normalized === 'object' && Object.keys(normalized).length > 0
}

export function ScorecardSection() {
  const queryClient = useQueryClient()

  const [scorecardState, setScorecardState] = useState<ScorecardState>('idle')
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)
  const [justFinishedAnalysis, setJustFinishedAnalysis] = useState(false)

  useEffect(() => {
    const storedJobId = typeof window !== 'undefined'
      ? sessionStorage.getItem('analysis_job_id')
      : null
    if (storedJobId) {
      setAnalysisJobId(storedJobId)
      setScorecardState('analyzing')
    } else {
      setScorecardState('done')
    }
  }, [])

  const {
    data: scorecardData,
    isLoading: isScorecardLoading,
    isError: isScorecardError,
    error: scorecardError,
  } = useQuery({
    queryKey: ['scorecard'],
    queryFn: getMyScorecard,
    enabled: scorecardState === 'done',
    staleTime: 0,
    retry: (failureCount, error: any) => {
      if (error?.status === 404) return justFinishedAnalysis && failureCount < 10
      return failureCount < 3
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
  
  const generateMut = useMutation({
    mutationFn: startAnalysis,
    onSuccess: (data: any) => {
      const jobId: string = data.jobId
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('analysis_job_id', jobId)
      }
      setAnalysisJobId(jobId)
      setScorecardState('analyzing')
      queryClient.removeQueries({ queryKey: ['scorecard'] })
      queryClient.invalidateQueries({ queryKey: ['analysisCooldown'] })
    },
  })

  useEffect(() => {
    const handleStartAnalysis = (e: CustomEvent) => {
      const jobId: string | undefined = e.detail?.jobId
      if (!jobId) return
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('analysis_job_id', jobId)
      }
      setAnalysisJobId(jobId)
      setScorecardState('analyzing')
      queryClient.removeQueries({ queryKey: ['scorecard'] })
    }
    window.addEventListener('startAnalysis', handleStartAnalysis as EventListener)
    return () => window.removeEventListener('startAnalysis', handleStartAnalysis as EventListener)
  }, [queryClient])

  const handleAnalysisComplete = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('analysis_job_id')
    }
    setAnalysisJobId(null)
    setJustFinishedAnalysis(true)
    setScorecardState('done')
    queryClient.invalidateQueries({ queryKey: ['scorecard'] })
    queryClient.invalidateQueries({ queryKey: ['analysisCooldown'] })
  }, [queryClient])

  // ── Render ──────────────────────────────────────────────────────────

  if (scorecardState === 'idle') return null

  const isAnalyzing = scorecardState === 'analyzing' && !!analysisJobId

  const isNeverGenerated =
    isScorecardError && (scorecardError as any)?.status === 404 && !justFinishedAnalysis

  const normalized = !isScorecardLoading && scorecardData
    ? normalizeScorecard(scorecardData)
    : null

  const showScorecard = !isAnalyzing && !isNeverGenerated && isScorecardReady(normalized)

  return (
    <AnimatePresence mode="wait">
      {isAnalyzing ? (
        <motion.div
          key="poller"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.3 } }}
        >
          <AnalysisPoller
            jobId={analysisJobId!}
            onComplete={handleAnalysisComplete}
          />
        </motion.div>
      ) : showScorecard ? (
     <motion.div
  key="scorecard"
  layout
  initial={{
    opacity: 0,
    clipPath: 'inset(0 0 100% 0)',
  }}
  animate={{
    opacity: 1,
    clipPath: 'inset(0 0 0% 0)',
  }}
  exit={{
    opacity: 0,
    clipPath: 'inset(0 0 100% 0)',
  }}
  transition={{
    clipPath: {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    },
    opacity: {
      duration: 0.25,
    },
    layout: {
      type: 'spring',
      stiffness: 140,
      damping: 24,
    },
  }}
  style={{
    willChange: 'clip-path, opacity',
  }}
>
          <ScorecardView
            scorecard={normalized!}
            isPublic={false}
            onRegenerate={() => generateMut.mutate()}
          />
        </motion.div>
      ) : justFinishedAnalysis ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <LoadingSkeleton />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
