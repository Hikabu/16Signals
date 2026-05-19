'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Pencil,
  X,
  MapPin,
  Globe,
  Loader2,
  Check,
  Copy,
} from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {uploadAvatar} from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileUser {
  name: string
  username: string
  email: string
  avatarUrl?: string
}

export interface ProfileCandidate {
  bio?: string
  location?: string
  website?: string
  avatarUrl?: string
}

export interface ProfileSaveData {
  name: string
  bio: string
  location: string
  website: string
}

export interface ProfileHeaderProps {
  user: ProfileUser
  candidate: ProfileCandidate
  isPublic?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive initials from display name (up to 2 chars). */
function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Ensure website URL is absolute for the <a> href. */
function ensureAbsoluteUrl(url: string): string {
  if (!url) return '#'
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export function cleanUrlForDisplay(url: string) {
  if (!url) return ''

  return url
    .replace(/^https?:\/\//i, '') // remove http / https
    .replace(/^www\./i, '')       // remove www
    .replace(/\/$/, '')           // remove trailing slash
}
function getAvatarFallback(user: ProfileUser) {
  return (
    user.name ||
    user.username ||
    "?"
  )
}
// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** "/u/{username}" copy badge */
function UsernameCopyBadge({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_FRONTEND_URL}/u/${username}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }



  return (
    <button
      onClick={handleCopy}
      aria-label="Copy profile path"
      className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:border-border/80 hover:bg-muted/70 hover:text-foreground cursor-pointer"
    >
      <span>{cleanUrlForDisplay(`${process.env.NEXT_PUBLIC_FRONTEND_URL}/u/${username}`)}</span>
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
          >
            <Check className="h-3 w-3 text-emerald-400" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
          >
            <Copy className="h-3 w-3 transition-colors group-hover:text-foreground" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProfileHeader({
  user,
  candidate,
  isPublic = false,
}: ProfileHeaderProps) {
  // Local form state (only used in edit mode)
  const [formName, setFormName] = useState(user.name)
  const [formBio, setFormBio] = useState(candidate.bio ?? '')
  const [formLocation, setFormLocation] = useState(candidate.location ?? '')
  const [formWebsite, setFormWebsite] = useState(candidate.website ?? '')
  const [publicScorecard, setPublicScorecard] = useState(true)
   const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
const [avatarUrl, setAvatarUrl] = useState(candidate.avatarUrl ?? '')  
  useEffect(() => {
  setFormName(user.name)
  setFormBio(candidate.bio ?? '')
  setFormLocation(candidate.location ?? '')
  setFormWebsite(candidate.website ?? '')
    setAvatarUrl(candidate.avatarUrl ?? '')

}, [user.name, candidate.avatarUrl, candidate.bio, candidate.location, candidate.website])
  const onToggleEdit = () => setIsEditing((v) => !v)
  const onSave = async () => {
    setIsSaving(true)
    try {
      await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
  name: formName,
  bio: formBio,
  location: formLocation,
  website: formWebsite,
  avatarUrl, // from state
})
      })
    } finally {
      setIsSaving(false)
      setIsEditing(false)
    }
  }
  // Reset form when edit is cancelled
  const handleCancel = () => {
    setFormName(user.name)
    setFormBio(candidate.bio ?? '')
    setFormLocation(candidate.location ?? '')
    setFormWebsite(candidate.website ?? '')
    onToggleEdit()
  }

  const handleSave = () => {
    onSave()
  }

const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file || uploadingAvatar) return

  setUploadingAvatar(true)

  try {
    const res = await uploadAvatar(file) as { url: string }
    setAvatarUrl(res.url)
  } finally {
    setUploadingAvatar(false)
  }
}

  const initials = getInitials(user.name)

  return (
    <motion.div layout transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}>
      <Card className="w-full overflow-hidden rounded-xl px-4 py-4 sm:px-6 sm:py-5">
        {/* Top row: avatar + right-side actions */}
        <div className="flex items-start justify-between gap-3">
          {/* Avatar */}
          <div className="relative w-fit">
            <Avatar className="size-14 overflow-hidden">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={`${user.name} avatar`} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-base font-semibold">
                {getInitials(getAvatarFallback(user))}
              </AvatarFallback>
            </Avatar>

            {/* Upload overlay */}
            {uploadingAvatar && (
              <div className="absolute inset-0 grid place-items-center rounded-full bg-black/30">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
            )}

            {/* File input in edit mode */}
            {isEditing && (
              <>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingAvatar}
                  className="absolute inset-0 opacity-0 cursor-pointer rounded-full"
                  onChange={handleAvatarChange}
                />
                <div className="absolute inset-0 rounded-full ring-1 ring-primary/20 pointer-events-none" />
              </>
            )}
          </div>

          {/* Right-side controls (edit button + meta) */}
          {!isPublic && (
            <div className="flex shrink-0 flex-col items-end gap-2">
              {/* Edit / Cancel button */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={isEditing ? handleCancel : onToggleEdit}
                aria-label={isEditing ? 'Cancel editing' : 'Edit profile'}
                className="h-9 w-9 cursor-pointer"
              >
                {isEditing ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
              </Button>

              {/* Copy badge + public switch — hidden when editing to save space */}
              {!isEditing && (
                <>
                  <UsernameCopyBadge username={user.username} />
                  <div className="flex items-center gap-1.5">
                    <Label
                      htmlFor="public-scorecard-switch"
                      className="cursor-pointer text-xs text-muted-foreground"
                    >
                      Public
                    </Label>
                    <Switch
                      id="public-scorecard-switch"
                      checked={publicScorecard}
                      onCheckedChange={setPublicScorecard}
                      aria-label="Toggle public scorecard visibility"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Identity + form content */}
        <div className="mt-3">
          <AnimatePresence mode="wait" initial={false}>
            {isEditing ? (
              <motion.div
                key="edit"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-3"
              >
                {/* Name */}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="profile-name" className="text-xs text-muted-foreground">
                    Display name
                  </Label>
                  <Input
                    id="profile-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Your name"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Bio */}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="profile-bio" className="text-xs text-muted-foreground">
                    Bio
                  </Label>
                  <Textarea
                    id="profile-bio"
                    value={formBio}
                    onChange={(e) => setFormBio(e.target.value)}
                    placeholder="Short bio…"
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>

                {/* Location + Website */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="profile-location" className="text-xs text-muted-foreground">
                      Location
                    </Label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="profile-location"
                        value={formLocation}
                        onChange={(e) => setFormLocation(e.target.value)}
                        placeholder="City, Country"
                        className="h-9 pl-7 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor="profile-website" className="text-xs text-muted-foreground">
                      Website
                    </Label>
                    <div className="relative">
                      <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="profile-website"
                        value={formWebsite}
                        onChange={(e) => setFormWebsite(e.target.value)}
                        placeholder="yoursite.com"
                        className="h-9 pl-7 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Save / Cancel */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || !formName.trim()}
                    className="h-9 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      'Save changes'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="h-9 cursor-pointer"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-1.5"
              >
                <h1 className="text-xl font-semibold leading-tight text-foreground">
                  {user.name || ""}
                </h1>
                <p className="text-sm text-muted-foreground">@{user.username}</p>

                {candidate.bio && (
                  <p className="mt-1 text-sm leading-relaxed text-foreground/80 max-w-prose">
                    {candidate.bio}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
                    <span className={candidate.location ? 'text-muted-foreground' : 'text-muted-foreground/40'}>
                      {candidate.location || 'Not set'}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground/70" />
                    {candidate.website ? (
                      <a
                        href={ensureAbsoluteUrl(candidate.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {candidate.website.replace(/^https?:\/\//i, '')}
                      </a>
                    ) : (
                      <span className="text-muted-foreground/40">Not set</span>
                    )}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}

export default ProfileHeader
