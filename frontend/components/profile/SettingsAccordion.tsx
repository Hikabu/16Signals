'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Github,
  Mail,
  Wallet,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Copy,
  Check,
  Link2,
  Unlink,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/use-toast'
import { useAuthStore } from '@/lib/auth-store'
import { SolanaLinkButton } from './SolanaLinkButton'

import {
  getLinkedGithub,
  triggerGithubSync,
  getGithubSyncStatus,
  getLinkedWallet,
  getMfaSetup,
  activateMfa,
  deleteAccount,
  getSecurityInfo,
  changePassword,
  linkGithubAccount,
  linkGoogleAccount,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        })
      }}
      aria-label="Copy to clipboard"
      className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

function AccountRow({
  icon,
  label,
  username,
  onLink,
  onSync,
  isSyncing,
  isLinking,
}: {
  icon: React.ReactNode
  label: string
  username?: string
  onLink: () => void
  onSync?: () => void
  isSyncing?: boolean
  isLinking?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground">{icon}</span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {username ? (
            <span className="text-xs text-muted-foreground">{username}</span>
          ) : (
            <span className="text-xs text-muted-foreground/60">Not linked</span>
          )}
        </div>
      </div>
      {username ? (
        onSync && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            disabled={isSyncing}
            className="h-7 cursor-pointer px-2.5 text-xs text-muted-foreground hover:text-primary"
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Data'}
          </Button>
        )
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onLink}
          disabled={isLinking}
          className="h-7 cursor-pointer px-2.5 text-xs"
        >
          <Link2 className="mr-1 h-3 w-3" />
          {isLinking ? 'Connecting...' : 'Connect'}
        </Button>
      )}
    </div>
  )
}

function MfaSetupFlow({
  setupData,
  onActivate,
  onCancel,
  isActivating,
}: {
  setupData: any
  onActivate: (otp: string) => void
  onCancel: () => void
  isActivating?: boolean
}) {
  const [otp, setOtp] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <img
          src={setupData.qrCode || setupData.qrUri}
          alt="Scan this QR code with your authenticator app"
          className="h-36 w-36 rounded-lg border border-border bg-white p-1"
        />
        <p className="text-center text-xs text-muted-foreground">
          Scan with Google Authenticator, Authy, or any TOTP app.
        </p>
      </div>

      {setupData.secret && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Or enter manually</Label>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <code className="flex-1 break-all font-mono text-xs tracking-widest text-foreground">
              {setupData.secret}
            </code>
            <CopyButton value={setupData.secret} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor="mfa-otp-input" className="text-xs text-muted-foreground">
          Enter the 6-digit code from your app
        </Label>
        <Input
          id="mfa-otp-input"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          maxLength={6}
          className="h-9 text-center font-mono text-base tracking-[0.35em]"
        />
      </div>

      {setupData.recoveryCodes && setupData.recoveryCodes.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            2FA activated, save these recovery codes
          </div>
          <div className="grid grid-cols-2 gap-1">
            {setupData.recoveryCodes.map((code: string) => (
              <code
                key={code}
                className="rounded bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {code}
              </code>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onActivate(otp)}
          disabled={otp.length !== 6 || isActivating || (setupData.recoveryCodes?.length > 0)}
          className="cursor-pointer"
        >
          {isActivating ? 'Activating…' : 'Activate 2FA'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isActivating}
          className="cursor-pointer"
        >
          {setupData.recoveryCodes?.length > 0 ? 'Close' : 'Cancel'}
        </Button>
      </div>
    </div>
  )
}

function PasswordRevealInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SettingsAccordion() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // --- DANGER ---
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const deleteMut = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      useAuthStore.getState().clearAuth()
      toast({ title: 'Account deleted' })
      router.push('/')
    },
  })

  // --- GITHUB ---
  // Used only for displaying the GitHub username as a hint (sync profile)
  const { data: githubData } = useQuery({
    queryKey: ['linkedGithub'],
    queryFn: getLinkedGithub,
  })

  const [isGithubSyncing, setIsGithubSyncing] = useState(false)
  const githubSyncMut = useMutation({
    mutationFn: triggerGithubSync,
    onSuccess: () => {
      setIsGithubSyncing(true)
      toast({ title: 'GitHub sync started' })
    },
  })

  const { data: syncStatusData } = useQuery({
    queryKey: ['githubSyncStatus'],
    queryFn: getGithubSyncStatus,
    enabled: isGithubSyncing,
    refetchInterval: (query) => ((query.state.data as any)?.status === 'done' ? false : 2000),
  })

  React.useEffect(() => {
    if ((syncStatusData as any)?.status === 'done' && isGithubSyncing) {
      setIsGithubSyncing(false)
      toast({ title: 'GitHub sync completed!' })
      queryClient.invalidateQueries({ queryKey: ['linkedGithub'] })
    }
  }, [syncStatusData, isGithubSyncing, queryClient, toast])

  // --- WALLET ---
  // Reuses the same ['wallet'] key that ProfileClient uses, always in sync
  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: getLinkedWallet,
  })
  const walletAddress: string | undefined = (walletData as any)?.web3?.solanaAddress
  const walletLinked = (walletData as any)?.connected === true

  // --- SECURITY INFO (mfaEnabled, hasPassword, linkedProviders) ---
  // This is the single source of truth for which auth providers are linked.
  const { data: securityInfo, refetch: refetchSecurity } = useQuery({
    queryKey: ['security'],
    queryFn: getSecurityInfo,
  })

  // Invalidate security info on return from OAuth linking
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('linked')) {
      queryClient.invalidateQueries({ queryKey: ['security'] })
      // Clean up the URL param without a page reload
      const url = new URL(window.location.href)
      url.searchParams.delete('linked')
      window.history.replaceState({}, '', url.toString())
    }
  }, [queryClient])

  const githubLinked = securityInfo?.linkedProviders?.includes('GITHUB') ?? false
  const googleLinked = securityInfo?.linkedProviders?.includes('GOOGLE') ?? false
  // GitHub username from sync profile, shown as a display hint when available
  const githubUsername = (githubData as any)?.username as string | undefined

  const mfaEnabled = securityInfo?.mfaEnabled ?? false
  const hasPassword = securityInfo?.hasPassword ?? false

  // --- MFA ---
  const [isMfaSetupOpen, setIsMfaSetupOpen] = useState(false)

  const { data: mfaSetupData, isFetching: isMfaFetching } = useQuery({
    queryKey: ['mfaSetup'],
    queryFn: getMfaSetup,
    enabled: isMfaSetupOpen,
  })

  const activateMut = useMutation({
    mutationFn: activateMfa,
    onSuccess: (data: any) => {
      queryClient.setQueryData(['mfaSetup'], {
        ...((mfaSetupData as any) || {}),
        recoveryCodes: data.backupCodes ?? data.recoveryCodes,
      })
      queryClient.setQueryData(['security'], (old: any) => ({
        ...old,
        mfaEnabled: true,
      }))
      toast({ title: 'Two-factor authentication enabled!' })
    },
    onError: () => {
      toast({ title: 'Invalid code. Please try again.', variant: 'destructive' })
    },
  })

  // --- PASSWORD ---
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')

  const changePasswordMut = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast({ title: hasPassword ? 'Password changed successfully' : 'Password set successfully' })
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
      queryClient.invalidateQueries({ queryKey: ['security'] })
    },
    onError: (e: any) => {
      toast({
        title: e?.message ?? 'Failed to change password',
        variant: 'destructive',
      })
    },
  })

  const pwValid =
    pwNew.length >= 8 &&
    pwNew === pwConfirm &&
    (!hasPassword || pwCurrent.length > 0)

  return (
    <Accordion type="single" collapsible className="w-full">
      {/* ── LINKED ACCOUNTS ─────────────────────────────────────────── */}
      <AccordionItem value="linked-accounts">
        <AccordionTrigger className="hover:no-underline">
          <span className="text-sm font-medium">Login options</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col divide-y divide-border/60">
            {/* GitHub */}
            <AccountRow
              icon={<Github className="h-4 w-4" />}
              label="GitHub"
              username={
                githubLinked
                  ? (githubUsername ?? 'GitHub linked')
                  : undefined
              }
              onLink={() => linkGithubAccount()}
              onSync={githubLinked ? () => githubSyncMut.mutate() : undefined}
              isSyncing={isGithubSyncing}
            />
            {/* Google */}
            <AccountRow
              icon={<Mail className="h-4 w-4" />}
              label="Google"
              username={
                googleLinked ? 'Google linked' : undefined
              }
              onLink={() => linkGoogleAccount()}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── PASSWORD ──────────────────────────────────────────────────── */}
      <AccordionItem value="password">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Password</span>
            {hasPassword ? (
              <Badge variant="outline" className="border-border bg-transparent text-[10px] text-muted-foreground">
                Set
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400">
                Not set
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-3 py-1">
            <p className="text-xs text-muted-foreground">
              {hasPassword
                ? 'Update your account password. You must provide your current password.'
                : 'Set a password so you can log in with email and password in addition to OAuth.'}
            </p>

            <div className="flex flex-col gap-2">
              {hasPassword && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="pw-current" className="text-xs text-muted-foreground">
                    Current password
                  </Label>
                  <PasswordRevealInput
                    id="pw-current"
                    value={pwCurrent}
                    onChange={setPwCurrent}
                    placeholder="Current password"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Label htmlFor="pw-new" className="text-xs text-muted-foreground">
                  New password
                </Label>
                <PasswordRevealInput
                  id="pw-new"
                  value={pwNew}
                  onChange={setPwNew}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pw-confirm" className="text-xs text-muted-foreground">
                  Confirm new password
                </Label>
                <PasswordRevealInput
                  id="pw-confirm"
                  value={pwConfirm}
                  onChange={setPwConfirm}
                  placeholder="Repeat new password"
                />
                {pwConfirm.length > 0 && pwNew !== pwConfirm && (
                  <p className="text-[11px] text-destructive">Passwords do not match</p>
                )}
              </div>

              <Button
                size="sm"
                className="mt-1 w-fit cursor-pointer"
                disabled={!pwValid || changePasswordMut.isPending}
                onClick={() =>
                  changePasswordMut.mutate({
                    currentPassword: hasPassword ? pwCurrent : undefined,
                    newPassword: pwNew,
                  })
                }
              >
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                {changePasswordMut.isPending
                  ? 'Saving…'
                  : hasPassword
                    ? 'Change password'
                    : 'Set password'}
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── SOLANA WALLET ────────────────────────────────────────────── */}
      <AccordionItem value="wallet">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Solana Wallet</span>
            {walletLinked ? (
              <Circle className="h-2 w-2 fill-teal-400 text-teal-400" />
            ) : (
              <Circle className="h-2 w-2 fill-muted-foreground/40 text-muted-foreground/40" />
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {walletLinked && walletAddress ? (
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-teal-400" />
                <code className="font-mono text-sm text-foreground">
                  {truncateAddress(walletAddress)}
                </code>
                <CopyButton value={walletAddress} />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toast({ title: 'Unlink functionality coming soon' })}
                className="h-7 cursor-pointer px-2.5 text-xs text-muted-foreground hover:text-destructive"
              >
                <Unlink className="mr-1 h-3 w-3" />
                Unlink
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 py-1">
              <p className="text-xs text-muted-foreground">
                Connect a Solana wallet to enable on-chain verification and Web3 scoring.
              </p>
              <SolanaLinkButton
                variant="outline"
                size="sm"
                className="w-fit cursor-pointer"
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wallet'] })}
              />
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* ── MFA ──────────────────────────────────────────────────────── */}
      <AccordionItem value="mfa">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Two-factor authentication</span>
            {mfaEnabled ? (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">
                <ShieldCheck className="mr-0.5 h-2.5 w-2.5" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border bg-transparent text-[10px] text-muted-foreground">
                <ShieldOff className="mr-0.5 h-2.5 w-2.5" />
                Disabled
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {mfaEnabled ? (
            <div className="flex items-center gap-2 py-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <p className="text-sm text-muted-foreground">
                Two-factor authentication is active on your account.
              </p>
            </div>
          ) : mfaSetupData ? (
            <MfaSetupFlow
              setupData={mfaSetupData}
              onActivate={(otp) => activateMut.mutate({ otp })}
              onCancel={() => {
                setIsMfaSetupOpen(false)
                queryClient.removeQueries({ queryKey: ['mfaSetup'] })
              }}
              isActivating={activateMut.isPending}
            />
          ) : (
            <div className="flex flex-col gap-3 py-1">
              <p className="text-xs text-muted-foreground">
                Add an extra layer of security to your account with a time-based one-time password.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMfaSetupOpen(true)}
                disabled={isMfaFetching}
                className="w-fit cursor-pointer"
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                {isMfaFetching ? 'Loading...' : 'Set up 2FA'}
              </Button>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* ── DANGER ZONE ──────────────────────────────────────────────── */}
      <AccordionItem value="danger-zone">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-sm font-medium text-destructive">Danger zone</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-3 py-1">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-fit cursor-pointer">
                  Delete account
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete account</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete your account, scorecard, and all data. There is no way to recover this.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="delete-confirm-input" className="text-xs text-muted-foreground">
                    Type <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">DELETE</code> to confirm
                  </Label>
                  <Input
                    id="delete-confirm-input"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="font-mono"
                  />
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setDeleteConfirm('')} className="cursor-pointer">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deleteConfirm !== 'DELETE' || deleteMut.isPending}
                    onClick={(e) => {
                      e.preventDefault()
                      if (deleteConfirm === 'DELETE') {
                        deleteMut.mutate()
                      }
                    }}
                    className="cursor-pointer bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {deleteMut.isPending ? 'Deleting…' : 'Delete my account'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
