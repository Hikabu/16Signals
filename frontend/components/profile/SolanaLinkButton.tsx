'use client'

import React from 'react'
import { Wallet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWalletFlow } from '@/lib/hooks/useWalletFlow'
import { submitWalletSignature } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'

interface SolanaLinkButtonProps {
  className?: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  onSuccess?: () => void
}

export function SolanaLinkButton({ 
  className, 
  variant = "outline", 
  size = "sm",
  onSuccess,
  disabled = false
}: SolanaLinkButtonProps & { disabled?: boolean }) {
  const { user } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const walletFlow = useWalletFlow(
    async (data) => {
      return submitWalletSignature({
        walletAddress: data.publicKey,
        signature: data.signature,
        message: data.message
      })
    },
    user?.id
  )

  React.useEffect(() => {
    if (walletFlow.status === 'done') {
      toast({ title: 'Wallet linked successfully!' })
      queryClient.invalidateQueries({ queryKey: ['linkedWallet'] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['analysisCooldown'] })
      if (onSuccess) onSuccess()
    } else if (walletFlow.status === 'error') {
      toast({ title: 'Failed to link wallet', variant: 'destructive' })
    }
  }, [walletFlow.status, queryClient, toast, onSuccess])

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => walletFlow.trigger({ userInitiated: true })
}
      disabled={(walletFlow.status !== 'idle' && walletFlow.status !== 'error' )|| disabled}
      className={className}
    >
      {walletFlow.status === 'signing' ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Please Sign...
        </>
      ) : walletFlow.status === 'submitting' ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Verifying...
        </>
      ) : walletFlow.status === 'done' ? (
        <>
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
          Linked
        </>
      ) : walletFlow.status === 'error' ? (
        <>
          <AlertCircle className="mr-1.5 h-3.5 w-3.5 text-destructive" />
          Try Again
        </>
      ) : (
        <>
          <Wallet className="mr-1.5 h-3.5 w-3.5" />
          Link Wallet
        </>
      )}
    </Button>
  )
}
