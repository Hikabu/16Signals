import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logoutCandidate, logoutEmployer } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'

export function useLogout() {
  const router = useRouter()
  const clearAuth = useAuthStore(s => s.clearAuth)
  const role = useAuthStore(s => s.role)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => {
      if (role === 'employer') {
        return logoutEmployer()
      } else {
        return logoutCandidate()
      }
    },
    onSettled: () => {
      // Clear regardless of success/fail, server may already have revoked
      clearAuth()
      queryClient.clear() // wipe all cached data
      router.push('/')
    }
  })

  return mutation.mutate
}
