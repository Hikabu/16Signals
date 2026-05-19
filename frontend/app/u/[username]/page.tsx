import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Globe, UserX, Lock } from 'lucide-react'

import { ProfileHeader } from '@/components/profile/ProfileHeader'
import type {
  ProfileUser,
  ProfileCandidate,
} from '@/components/profile/ProfileHeader'

import { ScorecardView } from '@/components/ScorecardView'
import type { ScorecardData } from '@/components/ScorecardView'

import { VouchesSection } from '@/components/profile/VouchesSection'
import type { Vouch } from '@/components/profile/VouchesSection'

import { VouchForm } from '@/components/VouchForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

import {
  getPublicProfile,
  getPublicScorecard,
} from '@/lib/api'

//use : CANDIDATES
//TODO: UPDATE
import ShareButton from './ShareButton'
import { normalizeScorecard } from '@/lib/scorecard/normalizeScorecard'

export const revalidate = 60

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params

  const profile = await getPublicProfile(username)

  if (!profile) {
    return {
      title: 'Profile not found',
    }
  }

  return {
    title: `${profile.username}'s 16Signals Profile`,
    description:
      profile.bio ??
      `View ${profile.username}'s verified Web3 reputation on 16Signals.`,
  }
}

// ---------------------------------------------------------------------------
// Empty / not-found states
// ---------------------------------------------------------------------------

function NotFoundState({
  username,
}: {
  username: string
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <UserX
        className="h-12 w-12 text-muted-foreground"
        strokeWidth={1.5}
      />

      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          Profile not found
        </h1>

        <p className="text-sm text-muted-foreground">
          @{username} hasn&apos;t joined 16Signals yet.
        </p>
      </div>

      <Button variant="outline" size="sm" asChild>
        <Link href="/">Go to home</Link>
      </Button>
    </div>
  )
}

function NoScorecardState({
  name,
}: {
  name: string
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 border-dashed p-10 text-center">
      <Lock
        className="h-8 w-8 text-muted-foreground/50"
        strokeWidth={1.5}
      />

      <p className="text-sm text-muted-foreground">
        No scorecard yet.
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params

  // console.log(
  //   '📄 Generating profile page for:',
  //   username,
  // )

  // -----------------------------------------------------------------------
  // Public profile = source of truth
  // -----------------------------------------------------------------------

  const profile =
    await getPublicProfile(username)

  if (!profile) {
    return (
      <NotFoundState username={username} />
    )
  }

  // -----------------------------------------------------------------------
  // Optional scorecard
  // -----------------------------------------------------------------------

  const scorecard =
    await getPublicScorecard(username)

  const sc =
    (scorecard as Record<string, unknown>) ??
    {}

  // -----------------------------------------------------------------------
  // Header data
  // -----------------------------------------------------------------------

  const user: ProfileUser = {
    name: profile.username,
    username: profile.username,
    email: '',
    avatarUrl: undefined,
  }

  const candidate: ProfileCandidate = {
    bio: profile.bio || undefined,
    location:
      profile.location || undefined,
    website:
      profile.website || undefined,
  }

  // -----------------------------------------------------------------------
  // Vouches
  // -----------------------------------------------------------------------

  const vouches: Vouch[] =
  profile.vouches ?? []

  const ownerWalletAddress = ''

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="relative mb-8">
        <div className="absolute right-0 top-0 z-10">
          <ShareButton
            username={username}
            displayName={user.name}
          />
        </div>

        <ProfileHeader
          user={user}
          candidate={candidate}
          isPublic={true}
        />

        <div className="mt-2">
          <Badge
            variant="outline"
            className="inline-flex items-center gap-1 rounded-full border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
          >
            <Globe className="h-3 w-3 shrink-0" />
            Public profile
          </Badge>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[3fr_2fr]">
        {/* Scorecard */}
        <div className="min-w-0">
          {scorecard ? (
            <ScorecardView
              scorecard={
                normalizeScorecard(scorecard) as ScorecardData
              }
              isPublic={true}
            />
          ) : (
            <NoScorecardState
              name={user.name}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6 md:sticky md:top-8 md:self-start">
          <VouchesSection
            vouches={vouches}
            isPublic={true}
          />

          <VouchForm
            username={username}
            ownerWalletAddress={
              ownerWalletAddress
            }
          />
        </div>
      </div>
    </div>
  )
}