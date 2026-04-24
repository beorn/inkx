/**
 * React hook — Claude account + quota probe with periodic refresh.
 *
 * Fetches identity, plan, and per-window utilization from the active
 * profile's keychain slot (via accountly) on mount and every REFRESH_MS
 * thereafter. Consumers render whatever's available — the side panel can
 * show the email synchronously while plan/quotas arrive, then re-render
 * when the async state lands.
 */

import { useEffect, useState } from "react"
import { type AccountProbe, probeActiveAccount, resolveActiveEmail } from "../claude-account.ts"

/** Refresh cadence. Anthropic's windows tick slowly; 2 minutes is plenty. */
const REFRESH_MS = 120_000

export function useClaudeAccount(): AccountProbe {
  const [state, setState] = useState<AccountProbe>({
    email: resolveActiveEmail(),
    plan: null,
    quotas: [],
    error: null,
    loading: true,
  })

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
