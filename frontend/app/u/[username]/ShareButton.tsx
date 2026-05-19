'use client'

import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

interface ShareButtonProps {
  username: string
  displayName: string
}

export default function ShareButton({ username, displayName }: ShareButtonProps) {
  const { toast } = useToast()

  const handleShare = async () => {
    const url = `${window.location.origin}/u/${username}`
    const title = `${displayName} on Colosseum`

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // User cancelled or API unavailable, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      toast({ title: 'Link copied to clipboard!' })
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' })
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      className="gap-1.5"
      aria-label="Share profile"
    >
      <Share2 className="h-3.5 w-3.5" />
      Share
    </Button>
  )
}
