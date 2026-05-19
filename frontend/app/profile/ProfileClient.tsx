'use client'

import React, { useState, useEffect } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLinkedWallet,
  startAnalysis,
  getAnalysisCooldown,
  getMe,
  getCandidateProfile,
  updateUser,
  updateCandidateProfile,
  apiFetch,
  getMyScorecard
} from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { GenerateScorecardSection } from '@/components/profile/GenerateScorecardSection'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { ScorecardSection } from '@/components/profile/ScorecardSection'
import { SettingsAccordion } from '@/components/profile/SettingsAccordion'
import { AnimatePresence, motion } from 'framer-motion'

const SYNC_PERIOD = new Set([
  'CONNECT_REQUEST',
  'CONNECT_SUCCESS',
  'SYNC_REQUEST',
  'SYNC_FETCH_REQUEST',
  'SYNC_FETCH_SUCCESS',
])

const GITHUB_LINKED_STATUSES = new Set([
  'CONNECT_SUCCESS',
  'SYNC_REQUEST',
  'SYNC_FETCH_REQUEST',
  'SYNC_FETCH_SUCCESS',
  'SYNC_SUCCESS',
])
export default function ProfileClient() {
  // console.log('PROFILE CLIENT RENDER')
  const queryClient = useQueryClient()
  const { toast } = useToast()
  // Controls whether GenerateScorecardSection is expanded.
  // Starts open; auto-collapses when analysis is triggered.
const { data: scorecard } = useQuery({
  queryKey: ['scorecard'],
  queryFn: getMyScorecard,
  retry: false,
})

const [generateOpen, setGenerateOpen] = useState(false)

useEffect(() => {
  // only auto-open if user has no scorecard
  if (scorecard === null) {
    setGenerateOpen(true)
  }
}, [scorecard])

  const fetchGithubStatus = async () => {
  // console.log('FETCH GITHUB STATUS CALLED')

  const data = await apiFetch('/sync/github/status')

  // console.log('GITHUB STATUS RESPONSE', data)

  return data
}
// const { data: githubStatus } = useQuery({
const {
  data: githubStatus,
  error,
  isError,
  isLoading,
  status,
} = useQuery({
  queryKey: ['githubStatus'],
  queryFn: fetchGithubStatus,
  refetchInterval: (query) => {
    const status = query.state.data?.syncStatus

    const syncing = SYNC_PERIOD.has(status)

    return syncing ? 2000 : false
  },
  
})
// console.log('QUERY STATUS', status)
// console.log('QUERY LOADING', isLoading)
// console.log('QUERY ERROR', error)
// console.log('IS ERROR', isError)
// console.log('GITHUB STATUS DATA', githubStatus)

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe })
  const { data: candidate } = useQuery({ queryKey: ['candidate'], queryFn: getCandidateProfile })

  const updateUserMut = useMutation({
    mutationFn: updateUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
  const updateCandMut = useMutation({
    mutationFn: updateCandidateProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate'] }),
  })

  const handleSaveProfile = async (data: { name: string; bio: string; location: string; website: string }) => {
    try {
      await Promise.all([
        updateUserMut.mutateAsync({ name: data.name }),
        updateCandMut.mutateAsync({ bio: data.bio, location: data.location, website: data.website })
      ])
      toast({ title: "Profile saved" })
    } catch (error) {
      toast({ title: "Failed to save profile", variant: "destructive" })
    }
  }

  // 1. Cooldown Query
  const { data: cooldown } = useQuery({
    queryKey: ['analysisCooldown'],
    queryFn: getAnalysisCooldown,
    staleTime: 30_000,
  })

  const [githubUiSyncing, setGithubUiSyncing] = useState(false)

const handleSyncGithub = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  setGithubUiSyncing(true)

  window.open(
    `${apiUrl}/sync/github/connect`,
    'github_oauth',
    'width=600,height=700'
  )

  const interval = setInterval(async () => {
    const result = await queryClient.fetchQuery({
      queryKey: ['githubStatus'],
      queryFn: fetchGithubStatus,
    })
// 
   // console.log('POLL RESULT', result)

    if (
      result?.syncStatus === 'SYNC_SUCCESS' ||
      result?.syncStatus === 'SYNC_FAILED' ||
      result?.syncStatus === 'CONNECT_SUCCESS'
    ) {
      clearInterval(interval)
      setGithubUiSyncing(false)
    }
  }, 2000)

  setTimeout(() => {
    clearInterval(interval)
    setGithubUiSyncing(false)
  }, 60000)
}

  // 3. Wallet Status
  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: getLinkedWallet,
  })

  // 4. Generate Mutation
  const generateMut = useMutation({
    mutationFn: startAnalysis,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['analysisCooldown'] })
      toast({ title: "Analysis started" })
      setGenerateOpen(false) // collapse when analysis kicks off
      if (typeof window !== 'undefined' && data?.jobId) {
        window.dispatchEvent(new CustomEvent('startAnalysis', { detail: { jobId: data.jobId } }))
      }
    },
  })


const normalizedSyncStatus =
  githubUiSyncing
    ? 'SYNC_REQUEST'
    : (githubStatus?.syncStatus ?? 'NOT_SYNCED')
    
const githubStatusMapped = {
  isLinked: normalizedSyncStatus !== 'NOT_SYNCED',
  lastSyncAt: githubStatus?.lastSyncAt,
  syncStatus: normalizedSyncStatus,
  cooldownUntil: githubStatus?.cooldownUntil,
}

  const walletStatus = {
  isLinked: walletData?.connected ?? false,
  address: walletData?.web3?.solanaAddress ?? undefined,
  cooldownUntil: cooldown?.wallet?.cooldownUntil ?? undefined,
}

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-8">
      {/* S1: Profile Header */}
      <ProfileHeader
        user={{
          name: (user as any)?.name ?? '',
          username: (user as any)?.username ?? '',
          email: (user as any)?.email ?? '',
        }}
        candidate={{
          bio: (candidate as any)?.bio ?? '',
          location: (candidate as any)?.location ?? '',
          website: (candidate as any)?.website ?? '',
          avatarUrl: (candidate as any)?.avatarUrl ?? '',
        }}
      />
<motion.div
  layout
  initial={false}
  transition={{
    type: 'spring',
    stiffness: 260,
    damping: 24,
  }}
>
  <GenerateScorecardSection
    githubStatus={githubStatusMapped}
    walletStatus={walletStatus}
    generateCooldownUntil={cooldown?.generate?.cooldownUntil ?? undefined}
    onSyncGithub={handleSyncGithub}
    onGenerate={() => generateMut.mutate()}
    isGenerating={generateMut.isPending}
    isOpen={generateOpen}
    onToggle={() => setGenerateOpen(o => !o)}
  />
</motion.div>
      {/* S1b: Generate Scorecard Section */}

      {/* S2: Scorecard Section */}
      <ScorecardSection />
      
      {/* S3: Vouches Section (Placeholder) */}
      
      {/* S4: Applications Section (Placeholder) */}
      
      {/* S5: Settings Accordion */}
      <div className="pt-6 border-t mt-8">
        <h2 className="text-lg font-semibold mb-4">Account Settings</h2>
        <SettingsAccordion />
      </div>
    </div>
  )
}
