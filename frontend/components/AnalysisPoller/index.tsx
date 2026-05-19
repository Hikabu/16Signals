'use client'

import React, { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAnalysisStatus, getAnalysisResult } from '@/lib/api'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export interface AnalysisPollerProps {
  jobId: string
  onComplete: () => void
}

export function AnalysisPoller({ jobId, onComplete }: AnalysisPollerProps) {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['analysis', jobId],
    queryFn: () => getAnalysisStatus(jobId),
    refetchInterval: (query) => (query.state.data as any)?.status === 'complete' ? false : 2000,
  })

  useEffect(() => {
    let mounted = true

    async function handleComplete() {
      try {
        await getAnalysisResult(jobId)
        if (!mounted) return
        sessionStorage.removeItem('analysis_job_id')
        onComplete()
      } catch (err) {
        console.error('Failed to fetch analysis result:', err)
      }
    }

    if ((data as any)?.status === 'complete') {
      handleComplete()
    }

    return () => { mounted = false }
  }, [data, jobId, onComplete, queryClient])

  return (
    <Card className="border-muted bg-muted/50 overflow-hidden relative">
      {typeof (data as any)?.progress === 'number' && (
        <div
          className="absolute top-0 left-0 h-1 bg-primary transition-all duration-500"
          style={{ width: `${(data as any).progress}%` }}
        />
      )}
      <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <div className="text-center space-y-1">
          <h3 className="font-medium text-lg">Analyzing Data...</h3>
          <p className="text-sm text-muted-foreground">
            {(data as any)?.progress
              ? `Progress: ${(data as any).progress}%`
              : 'We are compiling your signals and computing your scorecard.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
