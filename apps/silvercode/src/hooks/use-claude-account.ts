/**
 * React hook — Claude account + quota probe with periodic refresh.
 *
 * Fetches identity, plan, and per-window utilization from the active
 * profile's keychain slot (via accountly) on mount and every REFRESH_MS
 * thereafter. Backed by a 60s disk cache so close+reopen cycles reuse
 * the recent response instead of hitting Anthropic's /api/usage and
 * getting rate-limited.
 */

import { useEffect, useState } from "react"
import {
  type AccountProbe,
  probeActiveAccount,
  readCachedProbeSync,
  resolveActiveEmail,
} from "../claude-account.ts"

/** Refresh cadence. Anthropic's windows tick slowly; 2 minutes is plenty. */
const REFRESH_MS = 120_000

export function useClaudeAccount(): AccountProbe {
  // Synchronous init from disk cache (when present + fresh) so the side
  // panel renders quotas immediately on startup instead of flashing
  // "Loading…" while the async probe runs.
  const cached = readCachedProbeSync()
  const [state, setState] = useState<AccountProbe>(
    cached ?? {
      email: resolveActiveEmail(),
      plan: null,
      quotas: [],
      error: null,
      loading: true,
    },
  )

  useEffect(() => {
    let cancelled = false
    async function refresh(): Promise<void> {
      const next = await probeActiveAccount()
      if (!cancelled) setState(next)
    }
    void refresh()
    const id = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return state
}
