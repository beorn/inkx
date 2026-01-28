import { useSyncExternalStore } from 'react'
import type { PatchedConsole, ConsoleEntry } from '@beorn/term'

/**
 * Hook to subscribe to console entries from a PatchedConsole.
 * Re-renders when new entries arrive.
 */
export function useConsole(patched: PatchedConsole): readonly ConsoleEntry[] {
  return useSyncExternalStore(
    patched.subscribe,
    patched.getSnapshot
  )
}
