'use client'

import { useEffect } from 'react'

export default function GithubCallback() {
  useEffect(() => {
    window.close()
  }, [])

  return <div>Connecting GitHub...</div>
}