import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import { getWalletChallenge } from '../api'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

import { useEffect, useRef } from 'react'


export function useWalletFlow(
  submitFn: (data: { signature: string, publicKey: string, message: string }) => Promise<any>,
  userId?: string
) {

const wallet = useWallet()
  const [status, setStatus] = useState<'idle' | 'signing' | 'submitting' | 'done' | 'error'>('idle')
const hasAutoTriggered = useRef(false)
 const pendingIntent = useRef(false) 

useEffect(() => {
  // Wallet was just selected from modal
  if (wallet.wallet && !wallet.connected && !hasAutoTriggered.current && pendingIntent.current) {
    hasAutoTriggered.current = true
    trigger()
  }

  if (!wallet.wallet) {
    hasAutoTriggered.current = false
  }
}, [wallet.wallet])


 const trigger = async (opts?: { userInitiated?: boolean }) => {
  console.log("trigger attempt")
  if (opts?.userInitiated) {
    pendingIntent.current = true
  }
  console.log("trigger contineu")
  const provider = (window as any)?.phantom?.solana

  try {
    setStatus('signing')

    if (!provider) {
      throw new Error('Phantom wallet not found')
    }

    // ensure connected
    if (!provider.isConnected) {
      await provider.connect()
    }

    const { challenge } = await getWalletChallenge()
    console.log("received challenge:", challenge)

    const encoded = new TextEncoder().encode(challenge)

    let result: any

    try {
      result = await provider.signMessage(encoded)
    } catch (e: any) {
      console.log('SIGN ERROR:', e)

      if (e?.message?.toLowerCase?.().includes('rejected')) {
        setStatus('idle')
        return
      }

      throw e
    }

    // ✅ normalize signature (THIS FIXES YOUR bs58 ERROR)
    const rawSig =
      result instanceof Uint8Array
        ? result
        : result?.signature
          ? result.signature
          : result

    const signature = bs58.encode(rawSig)

    setStatus('submitting')

    await submitFn({
      signature,
      publicKey: provider.publicKey.toBase58(),
      message: challenge,
    })

    setStatus('done')
  } catch (e: any) {
    console.error(e)

    if (
      e?.name === 'WalletSignMessageError' ||
      e?.message?.toLowerCase?.().includes('rejected')
    ) {
      setStatus('idle')
      return
    }

    setStatus('error')
    setTimeout(() => setStatus('idle'), 3000)
  }
}
  return { trigger, status }
}
